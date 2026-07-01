/**
 * Per-ad-account spend + performance metrics, and a shared date-range parser
 * for the dashboard date filters (presets + custom start/end).
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adAccounts,
  adSpend,
  campaigns,
  hourlyMetrics,
  keywordMetrics,
  searchTerms,
} from "@/db/schema";
import type { DateRange } from "@/lib/roas/aggregate";

// ── Date range ───────────────────────────────────────────────────────────
export const RANGE_PRESETS = [
  { key: "7d", days: 7, label: "7 days" },
  { key: "30d", days: 30, label: "30 days" },
  { key: "90d", days: 90, label: "90 days" },
  { key: "all", days: 0, label: "All time" },
] as const;

export type RangeChoice = {
  range: DateRange;
  label: string;
  mode: "preset" | "custom";
  presetKey: string | null;
  startStr: string; // YYYY-MM-DD, for <input type=date> + link preservation
  endStr: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Resolve a date range from URL search params. A valid custom start+end wins;
 * otherwise a named preset; otherwise the 7-day default. End is made
 * exclusive at next-day midnight so the chosen end day is included.
 */
export function rangeFromParams(sp: {
  range?: string;
  start?: string;
  end?: string;
}): RangeChoice {
  if (sp.start && sp.end && ISO.test(sp.start) && ISO.test(sp.end)) {
    const start = new Date(`${sp.start}T00:00:00.000Z`);
    const endExcl = new Date(`${sp.end}T00:00:00.000Z`);
    endExcl.setUTCDate(endExcl.getUTCDate() + 1);
    return {
      range: { start, end: endExcl },
      label: `${sp.start} → ${sp.end}`,
      mode: "custom",
      presetKey: null,
      startStr: sp.start,
      endStr: sp.end,
    };
  }

  const preset =
    RANGE_PRESETS.find((p) => p.key === sp.range) ?? RANGE_PRESETS[0];
  const now = new Date();
  const endExcl = new Date(now);
  endExcl.setUTCHours(0, 0, 0, 0);
  endExcl.setUTCDate(endExcl.getUTCDate() + 1); // include today
  const start =
    preset.key === "all"
      ? new Date("2025-01-01T00:00:00.000Z")
      : new Date(now.getTime() - preset.days * 86_400_000);
  start.setUTCHours(0, 0, 0, 0);
  return {
    range: { start, end: endExcl },
    label: preset.label,
    mode: "preset",
    presetKey: preset.key,
    startStr: ymd(start),
    endStr: ymd(now),
  };
}

/** Query-string fragment that preserves the active date selection on links. */
export function dateParamString(choice: RangeChoice): string {
  return choice.mode === "custom"
    ? `start=${choice.startStr}&end=${choice.endStr}`
    : `range=${choice.presetKey}`;
}

// ── Per-account metrics ──────────────────────────────────────────────────
export type AccountSummary = {
  accountId: string;
  displayName: string;
  externalAccountId: string;
  platform: string;
  website: string | null;
  isActive: boolean;
  lastSyncedAt: Date | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

/** One row per ad account with summed metrics over the range (0 if no spend). */
export async function adAccountSummaries(
  range: DateRange
): Promise<AccountSummary[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);

  const accts = await db
    .select({
      id: adAccounts.id,
      displayName: adAccounts.displayName,
      externalAccountId: adAccounts.externalAccountId,
      platform: adAccounts.platform,
      website: adAccounts.website,
      isActive: adAccounts.isActive,
      lastSyncedAt: adAccounts.lastSyncedAt,
    })
    .from(adAccounts);

  const spendRows = await db
    .select({
      accountId: adSpend.adAccountId,
      spend: sql<number>`coalesce(sum(${adSpend.spend}),0)::float`,
      impressions: sql<number>`coalesce(sum(${adSpend.impressions}),0)::int`,
      clicks: sql<number>`coalesce(sum(${adSpend.clicks}),0)::int`,
      conversions: sql<number>`coalesce(sum(${adSpend.conversions}),0)::float`,
    })
    .from(adSpend)
    .where(and(gte(adSpend.date, startDate), lt(adSpend.date, endDate)))
    .groupBy(adSpend.adAccountId);

  const byId = new Map(spendRows.map((r) => [r.accountId, r]));
  return accts
    .map((a) => {
      const m = byId.get(a.id);
      return {
        accountId: a.id,
        displayName: a.displayName,
        externalAccountId: a.externalAccountId,
        platform: a.platform,
        website: a.website,
        isActive: a.isActive,
        lastSyncedAt: a.lastSyncedAt,
        spend: Number(m?.spend ?? 0),
        impressions: Number(m?.impressions ?? 0),
        clicks: Number(m?.clicks ?? 0),
        conversions: Number(m?.conversions ?? 0),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

export async function adAccountById(id: string) {
  return db.query.adAccounts.findFirst({
    where: eq(adAccounts.id, id),
    columns: {
      id: true,
      displayName: true,
      platform: true,
      externalAccountId: true,
      website: true,
      isActive: true,
      lastSyncedAt: true,
    },
  });
}

export type DailyMetricRow = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

/** Daily metric rows for one account over the range (newest first). */
export async function adAccountDaily(
  accountId: string,
  range: DateRange
): Promise<DailyMetricRow[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);
  const rows = await db
    .select({
      date: adSpend.date,
      spend: sql<number>`coalesce(sum(${adSpend.spend}),0)::float`,
      impressions: sql<number>`coalesce(sum(${adSpend.impressions}),0)::int`,
      clicks: sql<number>`coalesce(sum(${adSpend.clicks}),0)::int`,
      conversions: sql<number>`coalesce(sum(${adSpend.conversions}),0)::float`,
    })
    .from(adSpend)
    .where(
      and(
        eq(adSpend.adAccountId, accountId),
        gte(adSpend.date, startDate),
        lt(adSpend.date, endDate)
      )
    )
    .groupBy(adSpend.date)
    .orderBy(desc(adSpend.date));
  return rows.map((r) => ({
    date: r.date,
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
  }));
}

export type KeywordRow = {
  keywordText: string;
  matchType: string | null;
  campaignName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

/** Top keywords for an account over the range, by spend desc. */
export async function accountKeywords(
  accountId: string,
  range: DateRange,
  limit = 100
): Promise<KeywordRow[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);
  const rows = await db
    .select({
      keywordText: keywordMetrics.keywordText,
      matchType: keywordMetrics.matchType,
      campaignName: sql<string>`max(${keywordMetrics.campaignName})`,
      spend: sql<number>`coalesce(sum(${keywordMetrics.spend}),0)::float`,
      impressions: sql<number>`coalesce(sum(${keywordMetrics.impressions}),0)::int`,
      clicks: sql<number>`coalesce(sum(${keywordMetrics.clicks}),0)::int`,
      conversions: sql<number>`coalesce(sum(${keywordMetrics.conversions}),0)::float`,
    })
    .from(keywordMetrics)
    .where(
      and(
        eq(keywordMetrics.adAccountId, accountId),
        gte(keywordMetrics.date, startDate),
        lt(keywordMetrics.date, endDate)
      )
    )
    .groupBy(keywordMetrics.keywordText, keywordMetrics.matchType)
    .orderBy(desc(sql`sum(${keywordMetrics.spend})`))
    .limit(limit);
  return rows.map((r) => ({
    keywordText: r.keywordText,
    matchType: r.matchType,
    campaignName: r.campaignName,
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
  }));
}

export type WastedTermRow = {
  term: string;
  campaignName: string | null;
  spend: number;
  clicks: number;
  impressions: number;
};

/**
 * Search terms that spent money with ZERO conversions over the range — the
 * prime negative-keyword candidates. By spend desc.
 */
export async function accountWastedSearchTerms(
  accountId: string,
  range: DateRange,
  limit = 50
): Promise<WastedTermRow[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);
  const rows = await db
    .select({
      term: searchTerms.term,
      campaignName: sql<string>`max(${searchTerms.campaignName})`,
      spend: sql<number>`coalesce(sum(${searchTerms.spend}),0)::float`,
      clicks: sql<number>`coalesce(sum(${searchTerms.clicks}),0)::int`,
      impressions: sql<number>`coalesce(sum(${searchTerms.impressions}),0)::int`,
    })
    .from(searchTerms)
    .where(
      and(
        eq(searchTerms.adAccountId, accountId),
        gte(searchTerms.date, startDate),
        lt(searchTerms.date, endDate)
      )
    )
    .groupBy(searchTerms.term)
    .having(
      sql`sum(${searchTerms.spend}) > 0 and sum(${searchTerms.conversions}) = 0`
    )
    .orderBy(desc(sql`sum(${searchTerms.spend})`))
    .limit(limit);
  return rows.map((r) => ({
    term: r.term,
    campaignName: r.campaignName,
    spend: Number(r.spend),
    clicks: Number(r.clicks),
    impressions: Number(r.impressions),
  }));
}

// ── Company-wide "proven data" (feeds the AI Account Builder, Feature R) ─────
export type ProvenKeywordRow = {
  keyword: string;
  matchType: string | null;
  clicks: number;
  conversions: number;
  spend: number;
};

/**
 * Top keywords ACROSS ALL Google accounts over the range — what already earns
 * clicks/conversions company-wide. Ordered by conversions then clicks, so the
 * planner grounds a new account in proven winners. (keyword_metrics rows are
 * Google-only, so no platform filter is needed.)
 */
export async function provenKeywords(
  range: DateRange,
  limit = 40
): Promise<ProvenKeywordRow[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);
  const rows = await db
    .select({
      keyword: keywordMetrics.keywordText,
      matchType: keywordMetrics.matchType,
      clicks: sql<number>`coalesce(sum(${keywordMetrics.clicks}),0)::int`,
      conversions: sql<number>`coalesce(sum(${keywordMetrics.conversions}),0)::float`,
      spend: sql<number>`coalesce(sum(${keywordMetrics.spend}),0)::float`,
    })
    .from(keywordMetrics)
    .where(
      and(gte(keywordMetrics.date, startDate), lt(keywordMetrics.date, endDate))
    )
    .groupBy(keywordMetrics.keywordText, keywordMetrics.matchType)
    .having(sql`sum(${keywordMetrics.clicks}) > 0`)
    .orderBy(
      desc(sql`sum(${keywordMetrics.conversions})`),
      desc(sql`sum(${keywordMetrics.clicks})`)
    )
    .limit(limit);
  return rows.map((r) => ({
    keyword: r.keyword,
    matchType: r.matchType,
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
    spend: Number(r.spend),
  }));
}

export type ProvenWastedRow = { term: string; spend: number; clicks: number };

/**
 * Search terms that spent with ZERO conversions ACROSS ALL accounts — the
 * company-wide negative-keyword seed list for a fresh account. By spend desc.
 */
export async function provenWastedTerms(
  range: DateRange,
  limit = 40
): Promise<ProvenWastedRow[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);
  const rows = await db
    .select({
      term: searchTerms.term,
      spend: sql<number>`coalesce(sum(${searchTerms.spend}),0)::float`,
      clicks: sql<number>`coalesce(sum(${searchTerms.clicks}),0)::int`,
    })
    .from(searchTerms)
    .where(and(gte(searchTerms.date, startDate), lt(searchTerms.date, endDate)))
    .groupBy(searchTerms.term)
    .having(
      sql`sum(${searchTerms.spend}) > 0 and sum(${searchTerms.conversions}) = 0`
    )
    .orderBy(desc(sql`sum(${searchTerms.spend})`))
    .limit(limit);
  return rows.map((r) => ({
    term: r.term,
    spend: Number(r.spend),
    clicks: Number(r.clicks),
  }));
}

const HOUR_LABEL = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * One-line golden-hour summary (company-wide) for the planner's adScheduleNote:
 * the weekday + weekend peak click-hours over the range. Empty string if no
 * hourly data yet.
 */
export async function goldenHourSummary(range: DateRange): Promise<string> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);
  const rows = await db
    .select({
      dow: sql<number>`extract(isodow from ${hourlyMetrics.date})::int`,
      hour: hourlyMetrics.hour,
      clicks: sql<number>`coalesce(sum(${hourlyMetrics.clicks}),0)::int`,
    })
    .from(hourlyMetrics)
    .where(
      and(gte(hourlyMetrics.date, startDate), lt(hourlyMetrics.date, endDate))
    )
    .groupBy(sql`extract(isodow from ${hourlyMetrics.date})`, hourlyMetrics.hour);
  if (!rows.length) return "";

  const weekday = new Array(24).fill(0) as number[];
  const weekend = new Array(24).fill(0) as number[];
  for (const r of rows) {
    const h = Number(r.hour);
    if (h < 0 || h > 23) continue;
    const c = Number(r.clicks);
    if (Number(r.dow) >= 6) weekend[h] += c;
    else weekday[h] += c;
  }
  const peak = (arr: number[]) => {
    let best = -1;
    let idx = -1;
    arr.forEach((v, i) => {
      if (v > best) {
        best = v;
        idx = i;
      }
    });
    return best > 0 ? idx : -1;
  };
  const wd = peak(weekday);
  const we = peak(weekend);
  const parts: string[] = [];
  if (wd >= 0) parts.push(`weekdays peak ~${HOUR_LABEL(wd)}`);
  if (we >= 0) parts.push(`weekends peak ~${HOUR_LABEL(we)}`);
  return parts.length
    ? `Click demand (Malaysia time): ${parts.join(", ")}.`
    : "";
}

export type CampaignMetricRow = DailyMetricRow & { name: string };

/** Per-campaign totals for one account over the range (by spend desc). */
export async function adAccountCampaigns(
  accountId: string,
  range: DateRange
): Promise<CampaignMetricRow[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);
  const rows = await db
    .select({
      name: campaigns.name,
      date: sql<string>`''`,
      spend: sql<number>`coalesce(sum(${adSpend.spend}),0)::float`,
      impressions: sql<number>`coalesce(sum(${adSpend.impressions}),0)::int`,
      clicks: sql<number>`coalesce(sum(${adSpend.clicks}),0)::int`,
      conversions: sql<number>`coalesce(sum(${adSpend.conversions}),0)::float`,
    })
    .from(adSpend)
    .innerJoin(campaigns, eq(campaigns.id, adSpend.campaignId))
    .where(
      and(
        eq(adSpend.adAccountId, accountId),
        gte(adSpend.date, startDate),
        lt(adSpend.date, endDate)
      )
    )
    .groupBy(campaigns.name)
    .orderBy(desc(sql`sum(${adSpend.spend})`));
  return rows.map((r) => ({
    name: r.name,
    date: "",
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
  }));
}
