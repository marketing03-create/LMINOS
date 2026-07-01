/**
 * AI Google Ads analyst (Feature L, pillar 3) — the live analysis.
 *
 * Feeds one account's REAL performance data to Claude and gets back structured,
 * data-grounded change proposals (negative keywords, pauses, budget tweaks, ad
 * copy). Read-only to Google — proposals land in `ad_proposals` for a human to
 * approve. Runs through the Vercel AI Gateway via a bare "anthropic/<model>"
 * string (auth: AI_GATEWAY_API_KEY); model is env-configurable.
 *
 * Pure schema/context/prompt builders live in ads-analyst-core.ts (DB-free, so
 * they're unit-testable). This file adds the DB fetch + model call.
 */
import { generateObject } from "ai";
import {
  accountKeywords,
  accountWastedSearchTerms,
  adAccountById,
  adAccountCampaigns,
  adAccountDaily,
} from "@/lib/ads/account-metrics";
import { websiteSummaries } from "@/lib/ads/website-metrics";
import type { DateRange } from "@/lib/roas/aggregate";
import { serverEnv } from "@/lib/env";
import {
  ANALYST_SYSTEM,
  buildAnalystContext,
  buildAnalystPrompt,
  DEFAULT_ADS_ANALYST_MODEL,
  PROPOSALS_SCHEMA,
  type ProposalItem,
} from "./ads-analyst-core";

export type { ProposalItem } from "./ads-analyst-core";
export {
  PROPOSALS_SCHEMA,
  PROPOSAL_TYPES,
  RISK_TIERS,
  CONFIDENCE_LEVELS,
  buildAnalystContext,
  buildAnalystPrompt,
  ANALYST_SYSTEM,
  DEFAULT_ADS_ANALYST_MODEL,
} from "./ads-analyst-core";

export type AnalyzeResult = {
  proposals: ProposalItem[];
  modelUsed: string;
  account: { id: string; displayName: string; website: string | null };
};

/**
 * Fetch an account's data, ask Claude for proposals, return them (NOT yet
 * persisted — the caller inserts the rows). Throws on non-Google accounts or a
 * missing AI key so the caller can surface a clear message.
 */
export async function analyzeAdAccount(
  accountId: string,
  range: DateRange
): Promise<AnalyzeResult> {
  const env = serverEnv();
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "AI is not configured. Add AI_GATEWAY_API_KEY (Vercel AI Gateway) to enable analysis."
    );
  }

  const account = await adAccountById(accountId);
  if (!account) throw new Error("Ad account not found.");
  if (account.platform !== "google") {
    throw new Error("AI analysis currently supports Google Ads accounts only.");
  }

  const [daily, campaigns, keywords, wasted] = await Promise.all([
    adAccountDaily(accountId, range),
    adAccountCampaigns(accountId, range),
    accountKeywords(accountId, range, 50),
    accountWastedSearchTerms(accountId, range, 50),
  ]);

  let realOutcomes: Parameters<typeof buildAnalystContext>[0]["realOutcomes"] =
    null;
  if (account.website) {
    const site = (await websiteSummaries(range)).find(
      (s) => s.slug === account.website
    );
    if (site) {
      realOutcomes = {
        leads: site.leads,
        approved: site.approved,
        revenue: site.revenue,
        realRoas: site.realRoas,
      };
    }
  }

  const context = buildAnalystContext({
    account,
    range,
    daily,
    campaigns,
    keywords,
    wasted,
    realOutcomes,
  });

  const model = env.ADS_ANALYST_MODEL ?? DEFAULT_ADS_ANALYST_MODEL;
  const { object } = await generateObject({
    model,
    schema: PROPOSALS_SCHEMA,
    system: ANALYST_SYSTEM,
    prompt: buildAnalystPrompt(context),
    maxOutputTokens: 4000,
  });

  return {
    proposals: object.proposals,
    modelUsed: model,
    account: {
      id: account.id,
      displayName: account.displayName,
      website: account.website,
    },
  };
}
