import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { levenshtein, normalizeName } from "./levenshtein";

export type DedupeMatch =
  | { kind: "none" }
  | {
      kind: "exact_phone" | "exact_email";
      masterLeadId: string;
      candidateIds: string[];
    }
  | {
      kind: "fuzzy";
      masterLeadId: string;
      candidateIds: string[];
      // Fuzzy never auto-merges in Phase 1 — surfaced for manual review.
      requiresReview: true;
    };

type CandidateLead = {
  id: string;
  fullName: string | null;
  normalizedPhone: string | null;
  submittedAt: Date;
  masterLeadId: string | null;
};

const DAYS = 24 * 60 * 60 * 1000;

/**
 * Determine the master lead id for a candidate, given its dedupe matches.
 * Master = oldest by submitted_at among the match set.
 * If any candidate is already a child (master_lead_id set), follow the chain.
 */
function chooseMaster(candidates: CandidateLead[]): string {
  // Collapse children to their master id; pick the earliest submitted.
  const sorted = [...candidates].sort(
    (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()
  );
  const oldest = sorted[0];
  return oldest.masterLeadId ?? oldest.id;
}

/**
 * Run L1 / L2 / L3 dedupe checks against an already-inserted lead row.
 *
 * Caller (the dedupe worker) is responsible for the merge step
 * (setting master_lead_id, inserting touchpoint, status='duplicate_merged').
 */
export async function findDuplicates(leadId: string): Promise<DedupeMatch> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
  });
  if (!lead) {
    throw new Error(`lead not found: ${leadId}`);
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * DAYS);
  const sevenDaysAgo = new Date(Date.now() - 7 * DAYS);

  // L1 — exact normalized_phone within 90 days
  if (lead.normalizedPhone) {
    const rows = (await db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        normalizedPhone: leads.normalizedPhone,
        submittedAt: leads.submittedAt,
        masterLeadId: leads.masterLeadId,
      })
      .from(leads)
      .where(
        and(
          eq(leads.normalizedPhone, lead.normalizedPhone),
          ne(leads.id, lead.id),
          ne(leads.leadStatus, "duplicate_merged"),
          gte(leads.submittedAt, ninetyDaysAgo)
        )
      )
      .limit(20)) as CandidateLead[];

    if (rows.length > 0) {
      const all = [...rows, leadToCandidate(lead)];
      return {
        kind: "exact_phone",
        masterLeadId: chooseMaster(all),
        candidateIds: rows.map((r) => r.id),
      };
    }
  }

  // L2 — exact normalized_email within 90 days
  if (lead.normalizedEmail) {
    const rows = (await db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        normalizedPhone: leads.normalizedPhone,
        submittedAt: leads.submittedAt,
        masterLeadId: leads.masterLeadId,
      })
      .from(leads)
      .where(
        and(
          eq(leads.normalizedEmail, lead.normalizedEmail),
          ne(leads.id, lead.id),
          ne(leads.leadStatus, "duplicate_merged"),
          gte(leads.submittedAt, ninetyDaysAgo)
        )
      )
      .limit(20)) as CandidateLead[];

    if (rows.length > 0) {
      const all = [...rows, leadToCandidate(lead)];
      return {
        kind: "exact_email",
        masterLeadId: chooseMaster(all),
        candidateIds: rows.map((r) => r.id),
      };
    }
  }

  // L3 — fuzzy: same first-8 phone digits + Levenshtein name ≤ 2, within 7 days
  if (lead.normalizedPhone && lead.fullName) {
    const phone8 = lead.normalizedPhone.slice(0, 8);
    const rows = (await db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        normalizedPhone: leads.normalizedPhone,
        submittedAt: leads.submittedAt,
        masterLeadId: leads.masterLeadId,
      })
      .from(leads)
      .where(
        and(
          sql`substr(${leads.normalizedPhone}, 1, 8) = ${phone8}`,
          ne(leads.id, lead.id),
          ne(leads.leadStatus, "duplicate_merged"),
          gte(leads.submittedAt, sevenDaysAgo),
          isNull(leads.masterLeadId) // only compare to current masters
        )
      )
      .limit(50)) as CandidateLead[];

    const target = normalizeName(lead.fullName);
    const fuzzyHits = rows.filter((r) => {
      if (!r.fullName) return false;
      return levenshtein(normalizeName(r.fullName), target) <= 2;
    });

    if (fuzzyHits.length > 0) {
      return {
        kind: "fuzzy",
        masterLeadId: chooseMaster([...fuzzyHits, leadToCandidate(lead)]),
        candidateIds: fuzzyHits.map((r) => r.id),
        requiresReview: true,
      };
    }
  }

  return { kind: "none" };
}

function leadToCandidate(l: {
  id: string;
  fullName: string | null;
  normalizedPhone: string | null;
  submittedAt: Date;
  masterLeadId: string | null;
}): CandidateLead {
  return {
    id: l.id,
    fullName: l.fullName,
    normalizedPhone: l.normalizedPhone,
    submittedAt: l.submittedAt,
    masterLeadId: l.masterLeadId,
  };
}
