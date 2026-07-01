import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adAccounts,
  adSets,
  adSpend,
  ads,
  campaigns,
} from "@/db/schema";
import type { SpendRow } from "./parse";

export type ImportError = {
  row: number;
  error: string;
};

export type ImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
};

/**
 * Upsert ad_spend rows. Looks up ad_account by (platform, external_id);
 * lazily creates campaign / ad_set / ad rows when they don't exist yet.
 *
 * Idempotency: the unique constraint `ad_spend_uq` on
 * (ad_account_id, campaign_id, ad_set_id, ad_id, date) ensures duplicate
 * uploads of the same row update in place rather than double-counting.
 */
export async function importSpendRows(
  rows: Array<{ row: number; data: SpendRow }>
): Promise<ImportResult> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: ImportError[] = [];

  for (const r of rows) {
    try {
      const acct = await db.query.adAccounts.findFirst({
        where: and(
          eq(adAccounts.platform, r.data.platform),
          eq(adAccounts.externalAccountId, r.data.ad_account_external_id)
        ),
      });
      if (!acct) {
        skipped++;
        errors.push({
          row: r.row,
          error: `unknown ad_account: ${r.data.platform}:${r.data.ad_account_external_id}`,
        });
        continue;
      }

      const campaignId = await ensureCampaign(
        acct.id,
        r.data.campaign_external_id,
        r.data.campaign_name
      );
      const adSetId = r.data.ad_set_external_id
        ? await ensureAdSet(
            campaignId,
            r.data.ad_set_external_id,
            r.data.ad_set_name
          )
        : null;
      const adId =
        r.data.ad_external_id && adSetId
          ? await ensureAd(adSetId, r.data.ad_external_id, r.data.ad_name)
          : null;

      // Upsert via the composite unique constraint.
      const result = await db
        .insert(adSpend)
        .values({
          adAccountId: acct.id,
          campaignId,
          adSetId,
          adId,
          date: r.data.date,
          spend: r.data.spend.toFixed(2),
          impressions: r.data.impressions ?? 0,
          clicks: r.data.clicks ?? 0,
          platformLeadsReported: r.data.platform_leads_reported ?? 0,
          conversions: (r.data.conversions ?? 0).toFixed(2),
          conversionValue: (r.data.conversion_value ?? 0).toFixed(2),
        })
        .onConflictDoUpdate({
          target: [
            adSpend.adAccountId,
            adSpend.campaignId,
            adSpend.adSetId,
            adSpend.adId,
            adSpend.date,
          ],
          set: {
            spend: sql`excluded.spend`,
            impressions: sql`excluded.impressions`,
            clicks: sql`excluded.clicks`,
            platformLeadsReported: sql`excluded.platform_leads_reported`,
            conversions: sql`excluded.conversions`,
            conversionValue: sql`excluded.conversion_value`,
            updatedAt: sql`now()`,
          },
        })
        .returning({
          id: adSpend.id,
          createdAt: adSpend.createdAt,
          updatedAt: adSpend.updatedAt,
        });

      const rowOut = result[0];
      if (rowOut.createdAt.getTime() === rowOut.updatedAt.getTime()) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      errors.push({
        row: r.row,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { inserted, updated, skipped, errors };
}

async function ensureCampaign(
  adAccountId: string,
  externalCampaignId: string,
  name: string | undefined
): Promise<string> {
  const existing = await db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.adAccountId, adAccountId),
      eq(campaigns.externalCampaignId, externalCampaignId)
    ),
  });
  if (existing) {
    if (name && existing.name !== name) {
      await db
        .update(campaigns)
        .set({ name })
        .where(eq(campaigns.id, existing.id));
    }
    return existing.id;
  }
  const [row] = await db
    .insert(campaigns)
    .values({
      adAccountId,
      externalCampaignId,
      name: name ?? externalCampaignId,
    })
    .returning({ id: campaigns.id });
  return row.id;
}

async function ensureAdSet(
  campaignId: string,
  externalAdSetId: string,
  name: string | undefined
): Promise<string> {
  const existing = await db.query.adSets.findFirst({
    where: and(
      eq(adSets.campaignId, campaignId),
      eq(adSets.externalAdSetId, externalAdSetId)
    ),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(adSets)
    .values({
      campaignId,
      externalAdSetId,
      name: name ?? externalAdSetId,
    })
    .returning({ id: adSets.id });
  return row.id;
}

async function ensureAd(
  adSetId: string,
  externalAdId: string,
  name: string | undefined
): Promise<string> {
  const existing = await db.query.ads.findFirst({
    where: and(
      eq(ads.adSetId, adSetId),
      eq(ads.externalAdId, externalAdId)
    ),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(ads)
    .values({
      adSetId,
      externalAdId,
      name: name ?? externalAdId,
    })
    .returning({ id: ads.id });
  return row.id;
}
