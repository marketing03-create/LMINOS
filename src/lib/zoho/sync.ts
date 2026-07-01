/**
 * Zoho Sheet → LMIROS sync.
 *
 * Zoho is the system-of-record (it already holds the lead, the assigned
 * agent, and the outcome). So this sync MIRRORS rows rather than running them
 * through the dedupe/route/notify pipeline:
 *
 *   - Upsert one lead per Zoho row, keyed by external_record_id (idempotent).
 *   - When the row has an outcome status, upsert a matching sales_records row
 *     so the existing ROAS aggregator (which sums revenue from sales_records)
 *     works unchanged.
 *   - Match "Assigned To" name to a users row when possible; otherwise keep
 *     the raw name on the sales record.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { brands, campaigns, leads, rejectedLeads, salesRecords, users } from "@/db/schema";
import { agentEmail } from "./agents";
import { fetchAllZohoRecords } from "./client";
import { checkEligibility, type EligibilityReason } from "./eligibility";
import { extractAgentName, parseZohoRow, type ParsedZohoRow } from "./parse";

const OUTCOME_STATUSES = new Set([
  "approved",
  "closed",
  "rejected",
  "not_suitable",
  "unreachable",
]);
const REVENUE_STATUSES = new Set(["approved", "closed"]);

/**
 * Forward-only lead_status for the leads upsert.
 *
 * Once a lead reaches a terminal won state (approved/closed) — e.g. the
 * Telegram conversion bot recorded a real sale — the every-10-min Zoho
 * re-sync must NOT downgrade it back to pending/new just because the Zoho
 * row still says "pending". Zoho can still push a lead *forward* into
 * approved/closed; it just can't pull it back out.
 */
export const FORWARD_ONLY_LEAD_STATUS = sql`case when ${leads.leadStatus} in ('approved','closed') then ${leads.leadStatus} else excluded.lead_status end`;

export type ZohoSyncResult = {
  fetched: number;
  leadsUpserted: number;
  salesUpserted: number;
  rejectedUpserted: number;
  notEligible: number;
  errors: { recordId: string | null; error: string }[];
  durationMs: number;
};

// Map an eligibility failure to the rejected_leads reason enum.
const ELIGIBILITY_REASON: Record<EligibilityReason, string> = {
  out_of_coverage: "out_of_coverage",
  wrong_loan_type: "wrong_loan_type",
  not_eligible: "not_eligible",
};

async function resolveBrandId(
  website: string | null,
  cache: Map<string, string>
): Promise<string> {
  // Map the "Website" column → a brand. We try slug match on the website
  // token; fall back to a default brand. Cached per-sync.
  const key = (website ?? "default").toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const bySlug = await db.query.brands.findFirst({
    where: eq(brands.slug, key),
    columns: { id: true },
  });
  let brandId = bySlug?.id ?? null;

  if (!brandId) {
    const def = await db.query.brands.findFirst({
      where: eq(brands.slug, "default"),
      columns: { id: true },
    });
    brandId = def?.id ?? null;
  }

  if (!brandId) {
    // No default brand seeded — create a placeholder so sync never hard-fails.
    const inserted = await db
      .insert(brands)
      .values({ name: "Default Brand", slug: "default", isActive: true })
      .onConflictDoNothing({ target: brands.slug })
      .returning({ id: brands.id });
    if (inserted.length > 0) {
      brandId = inserted[0].id;
    } else {
      const def = await db.query.brands.findFirst({
        where: eq(brands.slug, "default"),
        columns: { id: true },
      });
      brandId = def!.id;
    }
  }

  cache.set(key, brandId);
  return brandId;
}

/**
 * Pre-load all users once per sync into a name→id map (D2 perf — avoids a
 * full-table scan per row). Keyed by lowercased full_name AND email local-part
 * so it matches both the synthetic agent users and any SSO users.
 */
async function loadAgentMap(): Promise<Map<string, string>> {
  const all = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email })
    .from(users);
  const map = new Map<string, string>();
  for (const u of all) {
    if (u.fullName) map.set(u.fullName.toLowerCase().trim(), u.id);
    const local = u.email.toLowerCase().split("@")[0];
    if (local && !map.has(local)) map.set(local, u.id);
  }
  return map;
}

/** externalCampaignId → campaigns.id, for attributing leads to campaigns. */
async function loadCampaignMap(): Promise<Map<string, string>> {
  const all = await db
    .select({ id: campaigns.id, ext: campaigns.externalCampaignId })
    .from(campaigns);
  const map = new Map<string, string>();
  for (const c of all) if (c.ext) map.set(c.ext, c.id);
  return map;
}

/**
 * Resolve an "Assigned To" value to a user id, CREATING a synthetic
 * sales-agent user on first sight so the sync is self-maintaining: add an
 * agent in Zoho and they appear in LMIROS automatically on the next sync.
 * Newly-created agents are added to the in-memory map for the rest of the run.
 */
async function ensureAgentId(
  assignedToRaw: string | null,
  agentMap: Map<string, string>
): Promise<string | null> {
  const name = extractAgentName(assignedToRaw);
  if (!name) return null;
  const key = name.toLowerCase().trim();
  const existing = agentMap.get(key);
  if (existing) return existing;

  const email = agentEmail(name);
  const found = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${email}`,
    columns: { id: true },
  });
  let id = found?.id ?? null;
  if (!id) {
    const [row] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email,
        fullName: name,
        role: "sales_agent",
        isActive: true,
      })
      .returning({ id: users.id });
    id = row.id;
  }
  agentMap.set(key, id);
  return id;
}

const CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Dedupe by a key, keeping the LAST occurrence. Required before
 * INSERT…ON CONFLICT: Postgres rejects a batch that targets the same
 * conflict key twice ("cannot affect row a second time"). The Zoho sheet
 * has duplicate Record IDs, so this collapses them to one row.
 */
function dedupeBy<T>(rows: T[], key: (r: T) => string): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(key(r), r);
  return [...map.values()];
}

/**
 * Bulk Zoho → LMIROS sync. All writes are batched:
 *   1. Parse all rows; collect distinct websites + agent names.
 *   2. Resolve brands (1 lookup each) + ensure agents exist (build name→id map).
 *   3. Bulk INSERT…ON CONFLICT (external_record_id) the leads, returning ids.
 *   4. Bulk INSERT…ON CONFLICT (sheet_row_id) the sales_records for outcome rows.
 *
 * Collapses ~3k sequential round-trips into a handful of statements so a
 * full ~1k-row sync runs in seconds (well under Vercel's 300s limit).
 */
export async function syncZoho(): Promise<ZohoSyncResult> {
  const t0 = Date.now();
  const resourceId = process.env.ZOHO_RESOURCE_ID;
  const worksheet = process.env.ZOHO_WORKSHEET_NAME;
  if (!resourceId || !worksheet) {
    throw new Error("ZOHO_RESOURCE_ID and ZOHO_WORKSHEET_NAME must be set");
  }

  const records = await fetchAllZohoRecords(resourceId, worksheet);
  const errors: { recordId: string | null; error: string }[] = [];

  // 1. Parse.
  const parsed: ParsedZohoRow[] = [];
  for (const rec of records) {
    const p = parseZohoRow(rec);
    if (p.ok) parsed.push(p);
    else errors.push({ recordId: p.externalRecordId, error: p.error });
  }

  // 2a. Resolve brands once per distinct website.
  const brandCache = new Map<string, string>();
  for (const website of new Set(parsed.map((p) => p.website ?? "default"))) {
    await resolveBrandId(website === "default" ? null : website, brandCache);
  }
  const brandOf = (website: string | null) =>
    brandCache.get((website ?? "default").toLowerCase())!;

  // 2b. Ensure all distinct agents exist; build name→id map.
  const agentMap = await loadAgentMap();
  for (const raw of new Set(parsed.map((p) => p.assignedToName))) {
    await ensureAgentId(raw, agentMap);
  }
  const agentOf = (raw: string | null) => {
    const name = extractAgentName(raw);
    return name ? (agentMap.get(name.toLowerCase().trim()) ?? null) : null;
  };

  // 3. Bulk upsert leads, keyed by external_record_id.
  const now = new Date();
  // Classify each row: eligibility (Type 1) takes precedence, then the agent's
  // Zoho status (Type 2). Produces the final lead status + an optional
  // rejected-pool entry.
  type Rejection = {
    reason: string;
    recycle: boolean;
    resale: boolean;
    nextAction: "recycle_later" | "sell_external";
    note: string | null;
  };
  const classify = (row: ParsedZohoRow): { status: string; rejection: Rejection | null } => {
    const elig = checkEligibility(row.raw as Record<string, unknown>);
    if (!elig.eligible && elig.primaryReason) {
      // Type 1 — Not Eligible (knowable from the form). Resale candidate.
      return {
        status: "rejected",
        rejection: {
          reason: ELIGIBILITY_REASON[elig.primaryReason],
          recycle: false,
          resale: true,
          nextAction: "sell_external",
          note: `Not eligible — ${elig.details.join("; ")}`,
        },
      };
    }
    const s = row.status;
    if (s === "rejected" || s === "not_suitable") {
      // Type 2 — eligible lead the agent rejected after follow-up. Recyclable.
      return {
        status: s,
        rejection: {
          reason: "not_suitable",
          recycle: true,
          resale: false,
          nextAction: "recycle_later",
          note: row.remark,
        },
      };
    }
    if (s === "unreachable") {
      return {
        status: "unreachable",
        rejection: {
          reason: "unreachable",
          recycle: true,
          resale: false,
          nextAction: "recycle_later",
          note: row.remark,
        },
      };
    }
    return { status: s ?? "new", rejection: null };
  };

  const classified = parsed.map((row) => ({ row, ...classify(row) }));
  let notEligible = 0;
  for (const c of classified) {
    if (c.rejection && c.rejection.resale && c.rejection.nextAction === "sell_external")
      notEligible++;
  }

  // Campaign attribution: link leads to campaigns the Google Ads sync already
  // created, matched by the campaign id the website form captured (e.g.
  // utm_campaign={campaignid}). No-op until those columns exist in Zoho.
  const campaignMap = await loadCampaignMap();

  const leadRows = classified.map(({ row, status }) => {
    return {
      brandId: brandOf(row.website),
      loanType: row.loanType,
      fullName: row.fullName,
      phoneNumberRaw: row.phoneRaw,
      normalizedPhone: row.normalizedPhone,
      emailRaw: row.emailRaw,
      normalizedEmail: row.normalizedEmail,
      sourcePlatform: "website" as const,
      sourceChannel: row.website,
      locationRegion: row.region,
      leadStatus: status as (typeof leads.leadStatus)["_"]["data"],
      // Shared-pool model (Feature M): a lead belongs to its WEBSITE's agent
      // pool, not one owner — so we do NOT pin leads.assignedAgentId from the
      // Zoho "Assigned To" name. The name is still kept (rawPayload +
      // sales_records.agentNameRaw); per-agent revenue is credited to whoever
      // CLOSES the sale via sales_records.agentId (set below) + the /sale bot.
      assignedAgentId: null,
      assignedAt: null,
      campaignId: row.campaignExternalId
        ? (campaignMap.get(row.campaignExternalId) ?? null)
        : null,
      externalRecordId: row.externalRecordId,
      submittedAt: row.submittedAt,
      rawPayload: row.raw as object,
      notes: row.remark,
    };
  });

  const dedupedLeadRows = dedupeBy(leadRows, (r) => r.externalRecordId);
  const leadIdByRecord = new Map<string, string>();
  for (const part of chunk(dedupedLeadRows, CHUNK)) {
    const ret = await db
      .insert(leads)
      .values(part)
      .onConflictDoUpdate({
        target: leads.externalRecordId,
        set: {
          brandId: sql`excluded.brand_id`,
          loanType: sql`excluded.loan_type`,
          fullName: sql`excluded.full_name`,
          phoneNumberRaw: sql`excluded.phone_number_raw`,
          normalizedPhone: sql`excluded.normalized_phone`,
          emailRaw: sql`excluded.email_raw`,
          normalizedEmail: sql`excluded.normalized_email`,
          sourceChannel: sql`excluded.source_channel`,
          locationRegion: sql`excluded.location_region`,
          leadStatus: FORWARD_ONLY_LEAD_STATUS,
          assignedAgentId: sql`excluded.assigned_agent_id`,
          assignedAt: sql`excluded.assigned_at`,
          // Keep an existing campaign link if this sync didn't carry one.
          campaignId: sql`coalesce(excluded.campaign_id, ${leads.campaignId})`,
          submittedAt: sql`excluded.submitted_at`,
          rawPayload: sql`excluded.raw_payload`,
          notes: sql`excluded.notes`,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: leads.id,
        externalRecordId: leads.externalRecordId,
      });
    for (const r of ret) {
      if (r.externalRecordId) leadIdByRecord.set(r.externalRecordId, r.id);
    }
  }

  // 4. Bulk upsert sales_records for outcome rows, keyed by sheet_row_id.
  const saleRows = parsed
    .filter((row) => row.status && OUTCOME_STATUSES.has(row.status))
    .map((row) => {
      const leadId = leadIdByRecord.get(row.externalRecordId);
      if (!leadId) return null;
      const revenue =
        row.status && REVENUE_STATUSES.has(row.status) && row.dealAmount != null
          ? row.dealAmount.toFixed(2)
          : null;
      return {
        leadId,
        sheetRowId: `zoho:${row.externalRecordId}`,
        sheetName: "zoho",
        phoneNumberRaw: row.phoneRaw,
        normalizedPhone: row.normalizedPhone,
        emailRaw: row.emailRaw,
        normalizedEmail: row.normalizedEmail,
        agentNameRaw: row.assignedToName,
        agentId: agentOf(row.assignedToName),
        loanType: row.loanType,
        salesStatus: row.status,
        approvalStatus: row.status === "approved" ? "approved" : null,
        salesAmount: row.dealAmount != null ? row.dealAmount.toFixed(2) : null,
        revenueValue: revenue,
        rejectionReason: row.status === "rejected" ? row.remark : null,
        remarks: row.remark,
        matchConfidence: "exact_phone" as const,
        syncedAt: now,
        rawRow: row.raw as object,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const dedupedSaleRows = dedupeBy(saleRows, (r) => r.sheetRowId);
  let salesUpserted = 0;
  for (const part of chunk(dedupedSaleRows, CHUNK)) {
    await db
      .insert(salesRecords)
      .values(part)
      .onConflictDoUpdate({
        target: salesRecords.sheetRowId,
        set: {
          leadId: sql`excluded.lead_id`,
          agentNameRaw: sql`excluded.agent_name_raw`,
          agentId: sql`excluded.agent_id`,
          salesStatus: sql`excluded.sales_status`,
          approvalStatus: sql`excluded.approval_status`,
          salesAmount: sql`excluded.sales_amount`,
          revenueValue: sql`excluded.revenue_value`,
          rejectionReason: sql`excluded.rejection_reason`,
          remarks: sql`excluded.remarks`,
          syncedAt: sql`excluded.synced_at`,
          rawRow: sql`excluded.raw_row`,
          updatedAt: sql`now()`,
        },
      });
    salesUpserted += part.length;
  }

  // 5. Bulk upsert rejected_leads (both Type 1 not-eligible and Type 2
  //    agent-rejected), keyed by lead_id. Snapshot fields copied for fast
  //    filtering in the pool views.
  const rejectedRows = classified
    .filter((c) => c.rejection !== null)
    .map((c) => {
      const leadId = leadIdByRecord.get(c.row.externalRecordId);
      if (!leadId) return null;
      const rej = c.rejection!;
      return {
        leadId,
        rejectionReason: rej.reason as (typeof rejectedLeads.rejectionReason)["_"]["data"],
        recycleEligible: rej.recycle,
        resaleEligible: rej.resale,
        nextAction: rej.nextAction,
        rejectedByAgentId: agentOf(c.row.assignedToName),
        snapshotLoanType: c.row.loanType,
        snapshotLocationRegion: c.row.region,
        snapshotSourcePlatform: "website",
        notes: rej.note,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const dedupedRejected = dedupeBy(rejectedRows, (r) => r.leadId);
  let rejectedUpserted = 0;
  for (const part of chunk(dedupedRejected, CHUNK)) {
    await db
      .insert(rejectedLeads)
      .values(part)
      .onConflictDoUpdate({
        target: rejectedLeads.leadId,
        set: {
          rejectionReason: sql`excluded.rejection_reason`,
          recycleEligible: sql`excluded.recycle_eligible`,
          resaleEligible: sql`excluded.resale_eligible`,
          nextAction: sql`excluded.next_action`,
          rejectedByAgentId: sql`excluded.rejected_by_agent_id`,
          snapshotLoanType: sql`excluded.snapshot_loan_type`,
          snapshotLocationRegion: sql`excluded.snapshot_location_region`,
          notes: sql`excluded.notes`,
          updatedAt: sql`now()`,
        },
      });
    rejectedUpserted += part.length;
  }

  return {
    fetched: records.length,
    leadsUpserted: dedupedLeadRows.length,
    salesUpserted,
    rejectedUpserted,
    notEligible,
    errors,
    durationMs: Date.now() - t0,
  };
}

// keep imports used across helpers
void and;
void eq;
