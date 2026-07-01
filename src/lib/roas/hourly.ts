/**
 * "Golden hour" aggregation: hourly_metrics summed by day-of-week × hour over a
 * date range. dow is Postgres EXTRACT(DOW): 0=Sunday … 6=Saturday. Times are in
 * the ad account's timezone (Malaysia).
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { hourlyMetrics } from "@/db/schema";
import type { DateRange } from "./aggregate";

export type HeatCell = {
  dow: number; // 0=Sun … 6=Sat
  hour: number; // 0–23
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
};

export async function hourlyHeatmap(
  range: DateRange,
  accountId?: string
): Promise<HeatCell[]> {
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);
  const where = accountId
    ? and(
        eq(hourlyMetrics.adAccountId, accountId),
        gte(hourlyMetrics.date, startDate),
        lt(hourlyMetrics.date, endDate)
      )
    : and(gte(hourlyMetrics.date, startDate), lt(hourlyMetrics.date, endDate));

  const rows = await db
    .select({
      dow: sql<number>`extract(dow from ${hourlyMetrics.date})::int`,
      hour: hourlyMetrics.hour,
      impressions: sql<number>`coalesce(sum(${hourlyMetrics.impressions}),0)::int`,
      clicks: sql<number>`coalesce(sum(${hourlyMetrics.clicks}),0)::int`,
      conversions: sql<number>`coalesce(sum(${hourlyMetrics.conversions}),0)::float`,
      spend: sql<number>`coalesce(sum(${hourlyMetrics.spend}),0)::float`,
    })
    .from(hourlyMetrics)
    .where(where)
    .groupBy(sql`extract(dow from ${hourlyMetrics.date})`, hourlyMetrics.hour);

  return rows.map((r) => ({
    dow: Number(r.dow),
    hour: Number(r.hour),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
    spend: Number(r.spend),
  }));
}
