/**
 * Daily time-series for the Trends page: ad metrics (from ad_spend, reliably
 * dated) joined with lead volume (from leads.submitted_at). Gaps are filled
 * with zeros so charts render continuously.
 */
import { and, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adSpend, leads } from "@/db/schema";
import type { DateRange } from "./aggregate";

export type TrendPoint = {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number; // platform-reported
  leads: number;
};

function eachDay(start: Date, endExclusive: Date): string[] {
  const out: string[] = [];
  const d = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate()
    )
  );
  const end = endExclusive.getTime();
  // Hard cap so a huge custom range can't explode the chart.
  let guard = 0;
  while (d.getTime() < end && guard++ < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function dailyTrends(range: DateRange): Promise<TrendPoint[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);

  const adRows = await db
    .select({
      date: adSpend.date,
      spend: sql<number>`coalesce(sum(${adSpend.spend}),0)::float`,
      impressions: sql<number>`coalesce(sum(${adSpend.impressions}),0)::int`,
      clicks: sql<number>`coalesce(sum(${adSpend.clicks}),0)::int`,
      conversions: sql<number>`coalesce(sum(${adSpend.conversions}),0)::float`,
    })
    .from(adSpend)
    .where(and(gte(adSpend.date, startDate), lt(adSpend.date, endDate)))
    .groupBy(adSpend.date);

  const leadRows = await db
    .select({
      date: sql<string>`(${leads.submittedAt})::date::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(gte(leads.submittedAt, range.start), lt(leads.submittedAt, range.end))
    )
    .groupBy(sql`(${leads.submittedAt})::date`);

  const adByDate = new Map(adRows.map((r) => [r.date, r]));
  const leadsByDate = new Map(leadRows.map((r) => [r.date, Number(r.n)]));

  return eachDay(range.start, range.end).map((date) => {
    const a = adByDate.get(date);
    return {
      date,
      spend: Number(a?.spend ?? 0),
      impressions: Number(a?.impressions ?? 0),
      clicks: Number(a?.clicks ?? 0),
      conversions: Number(a?.conversions ?? 0),
      leads: leadsByDate.get(date) ?? 0,
    };
  });
}
