/**
 * Google Ads keyword + search-term sync. Pulls `keyword_view` and
 * `search_term_view` daily metrics per active google account (using its own
 * encrypted token when present, else the global one) and upserts into
 * keyword_metrics / search_terms. Read-only on Google Ads (Explorer-OK).
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, keywordMetrics, searchTerms } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { decryptToken } from "@/lib/crypto/envelope";
import { getAccessTokenForRefreshToken } from "./auth";
import { fetchKeywordMetrics, fetchSearchTerms } from "./client";

export type KeywordSyncResult = {
  accounts: number;
  keywordRows: number;
  searchTermRows: number;
  errors: { account: string; error: string }[];
  days: number;
  durationMs: number;
};

const CHUNK = 500;
// Keep search_terms bounded to the last N days — by far the biggest table, and
// 90 days is plenty for negative-keyword work. Keyword + spend history stay full.
const SEARCH_TERM_RETENTION_DAYS = 90;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
function dedupe<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export async function syncGoogleAdsKeywords(
  opts: { days?: number } = {}
): Promise<KeywordSyncResult> {
  const started = Date.now();
  // Hard-cap the window so a sync can NEVER pull enough data to overflow a small
  // DB plan. (An all-time pull is what once filled the disk → read-only mode.)
  const days = Math.min(opts.days ?? 30, SEARCH_TERM_RETENTION_DAYS);
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

  let keywordRows = 0;
  let searchTermRows = 0;
  const errors: { account: string; error: string }[] = [];

  for (const acct of accounts) {
    try {
      let accessToken: string | undefined;
      if (acct.accessTokenEncrypted) {
        accessToken = await getAccessTokenForRefreshToken(
          decryptToken(acct.accessTokenEncrypted)
        );
      }
      const tokenOpts = accessToken ? { accessToken } : {};

      // Keywords
      const kws = await fetchKeywordMetrics(
        acct.externalAccountId,
        sinceISO,
        untilISO,
        tokenOpts
      );
      const kRows = dedupe(
        kws,
        (k) => `${k.adGroupId}|${k.criterionId}|${k.date}`
      ).map((k) => ({
        adAccountId: acct.id,
        campaignExternalId: k.campaignId,
        campaignName: k.campaignName,
        adGroupId: k.adGroupId,
        adGroupName: k.adGroupName,
        criterionId: k.criterionId,
        keywordText: k.keywordText,
        matchType: k.matchType,
        status: k.status,
        date: k.date,
        spend: k.cost.toFixed(2),
        impressions: k.impressions,
        clicks: k.clicks,
        conversions: k.conversions.toFixed(2),
      }));
      for (const part of chunk(kRows, CHUNK)) {
        await db
          .insert(keywordMetrics)
          .values(part)
          .onConflictDoUpdate({
            target: [
              keywordMetrics.adAccountId,
              keywordMetrics.adGroupId,
              keywordMetrics.criterionId,
              keywordMetrics.date,
            ],
            set: {
              campaignExternalId: sql`excluded.campaign_external_id`,
              campaignName: sql`excluded.campaign_name`,
              adGroupName: sql`excluded.ad_group_name`,
              keywordText: sql`excluded.keyword_text`,
              matchType: sql`excluded.match_type`,
              status: sql`excluded.status`,
              spend: sql`excluded.spend`,
              impressions: sql`excluded.impressions`,
              clicks: sql`excluded.clicks`,
              conversions: sql`excluded.conversions`,
              updatedAt: sql`now()`,
            },
          });
      }
      keywordRows += kRows.length;

      // Search terms
      const sts = await fetchSearchTerms(
        acct.externalAccountId,
        sinceISO,
        untilISO,
        tokenOpts
      );
      const sRows = dedupe(
        sts,
        (s) => `${s.campaignId}|${s.term}|${s.date}`
      ).map((s) => ({
        adAccountId: acct.id,
        campaignExternalId: s.campaignId,
        campaignName: s.campaignName,
        term: s.term,
        status: s.status,
        date: s.date,
        spend: s.cost.toFixed(2),
        impressions: s.impressions,
        clicks: s.clicks,
        conversions: s.conversions.toFixed(2),
      }));
      for (const part of chunk(sRows, CHUNK)) {
        await db
          .insert(searchTerms)
          .values(part)
          .onConflictDoUpdate({
            target: [
              searchTerms.adAccountId,
              searchTerms.campaignExternalId,
              searchTerms.term,
              searchTerms.date,
            ],
            set: {
              campaignName: sql`excluded.campaign_name`,
              status: sql`excluded.status`,
              spend: sql`excluded.spend`,
              impressions: sql`excluded.impressions`,
              clicks: sql`excluded.clicks`,
              conversions: sql`excluded.conversions`,
              updatedAt: sql`now()`,
            },
          });
      }
      searchTermRows += sRows.length;
    } catch (err) {
      errors.push({
        account: acct.externalAccountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Retention: prune search_terms older than the window so the table stays
  // bounded (safe to run every sync; keeps the DB small for the free plan).
  const retentionCutoff = ymd(
    new Date(until.getTime() - (SEARCH_TERM_RETENTION_DAYS - 1) * 86_400_000)
  );
  await db.delete(searchTerms).where(lt(searchTerms.date, retentionCutoff));

  const out: KeywordSyncResult = {
    accounts: accounts.length,
    keywordRows,
    searchTermRows,
    errors,
    days,
    durationMs: Date.now() - started,
  };
  await writeAudit({
    eventType: "google_ads.keywords_synced",
    entityType: "integration",
    entityId: "google_ads",
    after: { keywordRows, searchTermRows, errors: errors.length },
  });
  return out;
}
