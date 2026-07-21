/**
 * Load/shape the configurable business rules for the Search Terms Analyzer.
 * Resolution order: a per-campaign override → the account-wide default
 * (campaignExternalId = "") → the code default. Kept out of the pure core so the
 * core stays DB-free and unit-testable.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { campaignAnalysisSettings } from "@/db/schema";
import {
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
} from "@/lib/ai/search-terms-core";

type Row = typeof campaignAnalysisSettings.$inferSelect;

export function rowToSettings(r: Row): AnalysisSettings {
  return {
    competitorStrategy: r.competitorStrategy,
    brandNames: r.brandNames ?? [],
    productNames: r.productNames ?? [],
    servicesOffered: r.servicesOffered ?? [],
    servicesNotOffered: r.servicesNotOffered ?? [],
    supportedLocations: r.supportedLocations ?? [],
    unsupportedLocations: r.unsupportedLocations ?? [],
    mobileAppAvailable: r.mobileAppAvailable,
    onlineAppAvailable: r.onlineAppAvailable,
    minClicksBeforeExclude: r.minClicksBeforeExclude,
    minCostBeforeExcludeMyr: Number(r.minCostBeforeExcludeMyr),
    highSpendThresholdMyr:
      r.highSpendThresholdMyr == null ? null : Number(r.highSpendThresholdMyr),
    targetCostPerLeadMyr:
      r.targetCostPerLeadMyr == null ? null : Number(r.targetCostPerLeadMyr),
  };
}

export async function loadAnalysisSettings(
  accountId: string,
  campaignExternalId?: string | null
): Promise<AnalysisSettings> {
  const cid = campaignExternalId ?? "";
  if (cid) {
    const [c] = await db
      .select()
      .from(campaignAnalysisSettings)
      .where(
        and(
          eq(campaignAnalysisSettings.adAccountId, accountId),
          eq(campaignAnalysisSettings.campaignExternalId, cid)
        )
      )
      .limit(1);
    if (c) return rowToSettings(c);
  }
  const [acct] = await db
    .select()
    .from(campaignAnalysisSettings)
    .where(
      and(
        eq(campaignAnalysisSettings.adAccountId, accountId),
        eq(campaignAnalysisSettings.campaignExternalId, "")
      )
    )
    .limit(1);
  if (acct) return rowToSettings(acct);
  return DEFAULT_ANALYSIS_SETTINGS;
}

/** The raw settings row (for the settings editor), or null if none saved. */
export async function getSettingsRow(
  accountId: string,
  campaignExternalId: string
): Promise<Row | null> {
  const [r] = await db
    .select()
    .from(campaignAnalysisSettings)
    .where(
      and(
        eq(campaignAnalysisSettings.adAccountId, accountId),
        eq(campaignAnalysisSettings.campaignExternalId, campaignExternalId)
      )
    )
    .limit(1);
  return r ?? null;
}
