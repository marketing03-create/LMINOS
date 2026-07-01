import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { leads } from "@/db/schema";

export type MatchResult =
  | { kind: "unmatched" }
  | {
      kind: "exact_phone" | "exact_email";
      leadId: string;
    }
  | {
      kind: "fuzzy_multiple";
      candidateLeadIds: string[];
    };

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Walk the dedupe chain to a master lead id.
 * Sales records always link to the master, never a child.
 */
async function resolveMaster(leadId: string): Promise<string> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    columns: { id: true, masterLeadId: true },
  });
  if (!lead) return leadId;
  return lead.masterLeadId ?? lead.id;
}

/**
 * Find a lead that owns this sales record.
 *
 * L1 — exact normalized_phone (within 90d of submission, latest first)
 * L2 — exact normalized_email
 * L3 — phone last-8 (no fuzzy name on sales side — names in sheets are often
 *      the agent, not the customer; we instead require multiple candidates
 *      to flag for manual review)
 */
export async function findLeadForSales(input: {
  normalizedPhone: string | null;
  normalizedEmail: string | null;
}): Promise<MatchResult> {
  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

  // L1
  if (input.normalizedPhone) {
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.normalizedPhone, input.normalizedPhone),
          ne(leads.leadStatus, "duplicate_merged"),
          gte(leads.submittedAt, ninetyDaysAgo)
        )
      )
      .orderBy(sql`${leads.submittedAt} desc`)
      .limit(2);

    if (rows.length === 1) {
      const masterId = await resolveMaster(rows[0].id);
      return { kind: "exact_phone", leadId: masterId };
    }
    if (rows.length > 1) {
      // Multiple non-duplicate leads with same phone — flag for review.
      return { kind: "fuzzy_multiple", candidateLeadIds: rows.map((r) => r.id) };
    }
  }

  // L2
  if (input.normalizedEmail) {
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.normalizedEmail, input.normalizedEmail),
          ne(leads.leadStatus, "duplicate_merged"),
          isNotNull(leads.normalizedEmail)
        )
      )
      .orderBy(sql`${leads.submittedAt} desc`)
      .limit(2);

    if (rows.length === 1) {
      const masterId = await resolveMaster(rows[0].id);
      return { kind: "exact_email", leadId: masterId };
    }
    if (rows.length > 1) {
      return { kind: "fuzzy_multiple", candidateLeadIds: rows.map((r) => r.id) };
    }
  }

  // L3 — phone-last-8 partial match
  if (input.normalizedPhone && input.normalizedPhone.length >= 8) {
    const last8 = input.normalizedPhone.slice(-8);
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          sql`right(${leads.normalizedPhone}, 8) = ${last8}`,
          ne(leads.leadStatus, "duplicate_merged")
        )
      )
      .limit(5);
    if (rows.length === 1) {
      const masterId = await resolveMaster(rows[0].id);
      return { kind: "exact_phone", leadId: masterId };
    }
    if (rows.length > 1) {
      return { kind: "fuzzy_multiple", candidateLeadIds: rows.map((r) => r.id) };
    }
  }

  return { kind: "unmatched" };
}
