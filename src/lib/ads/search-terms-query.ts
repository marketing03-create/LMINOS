/**
 * Read helpers for the AI Search Terms Analyzer. Everything reads from the
 * `search_terms` table (already synced from Google Ads `search_term_view`) — the
 * analyzer never calls Google live. `topSearchTermsForAnalysis` returns the
 * bounded top-N actionable terms (by spend/clicks) for one account/campaign over
 * a range, with derived CTR/CPC/cost-per-conv + the existing add/exclude status.
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { searchTerms } from "@/db/schema";
import type { DateRange } from "@/lib/roas/aggregate";

export type AnalysisTermRow = {
  term: string;
  campaignExternalId: string;
  campaignName: string | null;
  status: string | null; // ADDED / EXCLUDED / NONE / ADDED_EXCLUDED
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number | null;
  avgCpc: number | null;
  costPerConv: number | null;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/**
 * Top-N search terms for one account (optionally one campaign) over the range,
 * grouped per (term, campaign), ordered by spend then clicks — the terms most
 * worth an AI opinion. `limit` is the hard cap that keeps one bounded run inside
 * the serverless time budget.
 */
export async function topSearchTermsForAnalysis(opts: {
  accountId: string;
  campaignExternalId?: string | null;
  range: DateRange;
  limit: number;
}): Promise<AnalysisTermRow[]> {
  const startDate = ymd(opts.range.start);
  const endDate = ymd(opts.range.end);

  const where = [
    eq(searchTerms.adAccountId, opts.accountId),
    gte(searchTerms.date, startDate),
    lt(searchTerms.date, endDate),
  ];
  if (opts.campaignExternalId) {
    where.push(eq(searchTerms.campaignExternalId, opts.campaignExternalId));
  }

  const rows = await db
    .select({
      term: searchTerms.term,
      campaignExternalId: searchTerms.campaignExternalId,
      campaignName: sql<string>`max(${searchTerms.campaignName})`,
      status: sql<string>`max(${searchTerms.status})`,
      spend: sql<number>`coalesce(sum(${searchTerms.spend}),0)::float`,
      clicks: sql<number>`coalesce(sum(${searchTerms.clicks}),0)::int`,
      impressions: sql<number>`coalesce(sum(${searchTerms.impressions}),0)::int`,
      conversions: sql<number>`coalesce(sum(${searchTerms.conversions}),0)::float`,
    })
    .from(searchTerms)
    .where(and(...where))
    .groupBy(searchTerms.term, searchTerms.campaignExternalId)
    .orderBy(
      desc(sql`sum(${searchTerms.spend})`),
      desc(sql`sum(${searchTerms.clicks})`)
    )
    .limit(opts.limit);

  return rows.map((r) => {
    const spend = Number(r.spend);
    const clicks = Number(r.clicks);
    const impressions = Number(r.impressions);
    const conversions = Number(r.conversions);
    return {
      term: r.term,
      campaignExternalId: r.campaignExternalId,
      campaignName: r.campaignName,
      status: r.status,
      spend: round(spend),
      clicks,
      impressions,
      conversions: round(conversions),
      ctr: impressions > 0 ? round(clicks / impressions, 4) : null,
      avgCpc: clicks > 0 ? round(spend / clicks) : null,
      costPerConv: conversions > 0 ? round(spend / conversions) : null,
    };
  });
}

export type SearchTermCampaign = {
  campaignExternalId: string;
  campaignName: string | null;
};

/** Distinct campaigns that have search-term data for an account (for the picker). */
export async function searchTermCampaigns(
  accountId: string
): Promise<SearchTermCampaign[]> {
  const rows = await db
    .select({
      campaignExternalId: searchTerms.campaignExternalId,
      campaignName: sql<string>`max(${searchTerms.campaignName})`,
    })
    .from(searchTerms)
    .where(eq(searchTerms.adAccountId, accountId))
    .groupBy(searchTerms.campaignExternalId)
    .orderBy(sql`max(${searchTerms.campaignName})`);
  return rows
    .filter((r) => r.campaignExternalId !== "")
    .map((r) => ({
      campaignExternalId: r.campaignExternalId,
      campaignName: r.campaignName,
    }));
}
