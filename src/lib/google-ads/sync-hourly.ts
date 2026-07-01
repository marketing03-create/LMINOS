/**
 * Google Ads hour-of-day sync → hourly_metrics. Pulls per campaign × date ×
 * hour, aggregates to (account, date, hour), upserts. Read-only (Explorer-OK).
 * Powers the "golden hour" / best-time analysis on the Trends page.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, hourlyMetrics } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { decryptToken } from "@/lib/crypto/envelope";
import { getAccessTokenForRefreshToken } from "./auth";
import { fetchHourlyMetrics } from "./client";

export type HourlySyncResult = {
  accounts: number;
  rows: number;
  errors: { account: string; error: string }[];
  days: number;
  durationMs: number;
};

const CHUNK = 500;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export async function syncGoogleAdsHourly(
  opts: { days?: number } = {}
): Promise<HourlySyncResult> {
  const started = Date.now();
  const days = opts.days ?? 90;
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 86_400_000);
  const sinceISO = ymd(since);
  const untilISO = ymd(until);

  const accounts = await db
    .select({
      id: adAccounts.id,
      externalAccountId: adAccounts.externalAccountId,
      accessTokenEncrypted: adAccounts.accessTokenEncrypted,
    })
    .from(adAccounts)
    .where(and(eq(adAccounts.platform, "google"), eq(adAccounts.isActive, true)));

  let rowsWritten = 0;
  const errors: { account: string; error: string }[] = [];

  for (const acct of accounts) {
    try {
      let accessToken: string | undefined;
      if (acct.accessTokenEncrypted) {
        accessToken = await getAccessTokenForRefreshToken(
          decryptToken(acct.accessTokenEncrypted)
        );
      }
      const raw = await fetchHourlyMetrics(
        acct.externalAccountId,
        sinceISO,
        untilISO,
        accessToken ? { accessToken } : {}
      );

      // Aggregate per (date, hour) across campaigns.
      const agg = new Map<
        string,
        { date: string; hour: number; impressions: number; clicks: number; cost: number; conversions: number }
      >();
      for (const r of raw) {
        const key = `${r.date}|${r.hour}`;
        const e =
          agg.get(key) ??
          { date: r.date, hour: r.hour, impressions: 0, clicks: 0, cost: 0, conversions: 0 };
        e.impressions += r.impressions;
        e.clicks += r.clicks;
        e.cost += r.cost;
        e.conversions += r.conversions;
        agg.set(key, e);
      }

      const values = [...agg.values()].map((e) => ({
        adAccountId: acct.id,
        date: e.date,
        hour: e.hour,
        impressions: e.impressions,
        clicks: e.clicks,
        conversions: e.conversions.toFixed(2),
        spend: e.cost.toFixed(2),
      }));

      for (const part of chunk(values, CHUNK)) {
        await db
          .insert(hourlyMetrics)
          .values(part)
          .onConflictDoUpdate({
            target: [hourlyMetrics.adAccountId, hourlyMetrics.date, hourlyMetrics.hour],
            set: {
              impressions: sql`excluded.impressions`,
              clicks: sql`excluded.clicks`,
              conversions: sql`excluded.conversions`,
              spend: sql`excluded.spend`,
              updatedAt: sql`now()`,
            },
          });
      }
      rowsWritten += values.length;
    } catch (err) {
      errors.push({
        account: acct.externalAccountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const out: HourlySyncResult = {
    accounts: accounts.length,
    rows: rowsWritten,
    errors,
    days,
    durationMs: Date.now() - started,
  };
  await writeAudit({
    eventType: "google_ads.hourly_synced",
    entityType: "integration",
    entityId: "google_ads",
    after: { rows: rowsWritten, errors: errors.length },
  });
  return out;
}
