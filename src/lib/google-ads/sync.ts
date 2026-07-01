/**
 * Google Ads → LMIROS metrics sync.
 *
 * For each active `google` ad account, pull a trailing window of daily
 * campaign metrics (impressions, clicks, cost, platform conversions) and
 * upsert them into `ad_spend`. We re-pull a trailing window every run because
 * conversions backfill for days *after* the click, so recent days keep
 * changing.
 *
 * Reuses `importSpendRows` (the single ad_spend upsert path, which also
 * lazily creates campaign rows) by mapping API rows to the SpendRow shape.
 */
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { decryptToken } from "@/lib/crypto/envelope";
import { importSpendRows } from "@/lib/spend/import";
import type { SpendRow } from "@/lib/spend/parse";
import { fetchCampaignMetrics } from "./client";
import { getAccessTokenForRefreshToken } from "./auth";

export type GoogleAdsSyncResult = {
  accounts: number;
  campaignsTouched: number;
  rowsUpserted: number;
  inserted: number;
  updated: number;
  skipped: number;
  days: number;
  since: string;
  until: string;
  errors: { account: string; error: string }[];
  durationMs: number;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Run `worker` over items with at most `limit` running at once. */
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const lanes = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (cursor < items.length) {
        await worker(items[cursor++]);
      }
    })
  );
}

// How many accounts to sync at once. Pool max is 10; 8 leaves headroom.
const SYNC_CONCURRENCY = 8;

export async function syncGoogleAdsMetrics(
  opts: { days?: number; accountId?: string } = {}
): Promise<GoogleAdsSyncResult> {
  const started = Date.now();
  const days = opts.days ?? 14;

  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const sinceISO = ymd(since);
  const untilISO = ymd(until);

  const accounts = await db
    .select({
      id: adAccounts.id,
      externalAccountId: adAccounts.externalAccountId,
      displayName: adAccounts.displayName,
      accessTokenEncrypted: adAccounts.accessTokenEncrypted,
    })
    .from(adAccounts)
    .where(
      and(
        eq(adAccounts.platform, "google"),
        eq(adAccounts.isActive, true),
        opts.accountId ? eq(adAccounts.id, opts.accountId) : undefined
      )
    );

  let campaignsTouched = 0;
  let rowsUpserted = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { account: string; error: string }[] = [];

  // Sync one account. (Shared counters are mutated here; safe because the JS
  // event loop runs these async tasks one-at-a-time, never truly in parallel.)
  async function syncOne(acct: (typeof accounts)[number]) {
    try {
      // If the account carries its own (encrypted) refresh token, authenticate
      // as that account's Google login — supports accounts under other Gmails.
      // Otherwise fall back to the global env credentials.
      let accessToken: string | undefined;
      if (acct.accessTokenEncrypted) {
        const refreshToken = decryptToken(acct.accessTokenEncrypted);
        accessToken = await getAccessTokenForRefreshToken(refreshToken);
      }

      const metricsRows = await fetchCampaignMetrics(
        acct.externalAccountId,
        sinceISO,
        untilISO,
        accessToken ? { accessToken } : {}
      );

      const spendRows: Array<{ row: number; data: SpendRow }> = metricsRows.map(
        (m, i) => ({
          row: i + 1,
          data: {
            platform: "google",
            ad_account_external_id: acct.externalAccountId,
            campaign_external_id: m.campaignId,
            campaign_name: m.campaignName,
            date: m.date,
            spend: m.cost,
            impressions: m.impressions,
            clicks: m.clicks,
            conversions: m.conversions,
          } as SpendRow,
        })
      );

      const res = await importSpendRows(spendRows);
      inserted += res.inserted;
      updated += res.updated;
      skipped += res.skipped;
      rowsUpserted += res.inserted + res.updated;
      campaignsTouched += new Set(metricsRows.map((m) => m.campaignId)).size;

      for (const e of res.errors) {
        errors.push({ account: acct.externalAccountId, error: e.error });
      }

      // Stamp last-synced regardless of row count so the UI shows freshness.
      await db
        .update(adAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(adAccounts.id, acct.id));
    } catch (err) {
      errors.push({
        account: acct.externalAccountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Run several accounts at once so 90+ accounts finish in ~1–2 min, not ~12.
  await runPool(accounts, SYNC_CONCURRENCY, syncOne);

  const out: GoogleAdsSyncResult = {
    accounts: accounts.length,
    campaignsTouched,
    rowsUpserted,
    inserted,
    updated,
    skipped,
    days,
    since: sinceISO,
    until: untilISO,
    errors,
    durationMs: Date.now() - started,
  };

  await writeAudit({
    eventType: "google_ads.metrics_synced",
    entityType: "integration",
    entityId: "google_ads",
    after: {
      accounts: out.accounts,
      rowsUpserted: out.rowsUpserted,
      window: `${sinceISO}..${untilISO}`,
      errors: out.errors.length,
    },
  });

  return out;
}
