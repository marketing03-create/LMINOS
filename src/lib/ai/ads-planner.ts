/**
 * AI Google Ads Account Builder (Feature R) — the live planning call.
 *
 * Pulls the company's PROVEN data (winning keywords, money-wasting search terms,
 * golden-hour windows, the destination website's real ROAS) and asks Claude to
 * draft a complete, launch-ready SEARCH account (a "blueprint"). Read-only to
 * Google: the blueprint lands in `ad_blueprints` for a human to review, edit,
 * approve, dry-run-validate, and (once Basic write access is granted) build.
 *
 * Runs through the Vercel AI Gateway via a bare "anthropic/<model>" string
 * (auth: AI_GATEWAY_API_KEY); model is env-configurable. Pure schema/prompt/
 * translator live in ads-planner-core.ts (DB-free, unit-tested).
 */
import { generateObject } from "ai";
import {
  goldenHourSummary,
  provenKeywords,
  provenWastedTerms,
} from "@/lib/ads/account-metrics";
import { websiteSummaries } from "@/lib/ads/website-metrics";
import type { DateRange } from "@/lib/roas/aggregate";
import { serverEnv } from "@/lib/env";
import {
  BLUEPRINT_SCHEMA,
  DEFAULT_ADS_PLANNER_MODEL,
  PLANNER_SYSTEM,
  buildPlannerContext,
  buildPlannerPrompt,
  type Blueprint,
} from "./ads-planner-core";

export type { Blueprint, BlueprintCampaign, BuildStep } from "./ads-planner-core";
export {
  BLUEPRINT_SCHEMA,
  DEFAULT_ADS_PLANNER_MODEL,
  PLANNER_SYSTEM,
  blueprintToBuildSteps,
  buildPlannerContext,
  buildPlannerPrompt,
  summarizeBlueprint,
  CID_PLACEHOLDER,
} from "./ads-planner-core";

export type PlanResult = {
  blueprint: Blueprint;
  modelUsed: string;
};

/** Server-enforced daily budget cap (MYR), or null if unset. */
export function budgetCapMyrPerDay(): number | null {
  const raw = serverEnv().ADS_DAILY_BUDGET_CAP_MYR;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Draft a launch-ready account blueprint for one website. Returns it (NOT yet
 * persisted — the caller inserts the row + materializes the build steps).
 * Throws on a missing AI key so the caller can surface a clear message.
 */
export async function planAccountBlueprint(input: {
  websiteSlug: string;
  websiteName: string;
  destinationUrl: string;
  range: DateRange;
}): Promise<PlanResult> {
  const env = serverEnv();
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "AI is not configured. Add AI_GATEWAY_API_KEY (Vercel AI Gateway) to enable the Account Builder."
    );
  }

  const [keywords, wasted, golden, sites] = await Promise.all([
    provenKeywords(input.range, 40),
    provenWastedTerms(input.range, 40),
    goldenHourSummary(input.range),
    websiteSummaries(input.range),
  ]);

  const site = sites.find((s) => s.slug === input.websiteSlug) ?? null;

  const context = buildPlannerContext({
    website: input.websiteName || input.websiteSlug,
    destinationUrl: input.destinationUrl,
    budgetCapMyrPerDay: budgetCapMyrPerDay(),
    provenKeywords: keywords,
    provenWastedTerms: wasted,
    goldenHours: golden,
    websitePerformance: site
      ? {
          leads: site.leads,
          approved: site.approved,
          revenue: site.revenue,
          realRoas: site.realRoas,
        }
      : null,
  });

  const model = env.ADS_PLANNER_MODEL ?? env.ADS_ANALYST_MODEL ?? DEFAULT_ADS_PLANNER_MODEL;
  const { object } = await generateObject({
    model,
    schema: BLUEPRINT_SCHEMA,
    system: PLANNER_SYSTEM,
    prompt: buildPlannerPrompt(context),
    maxOutputTokens: 8000,
  });

  return { blueprint: object, modelUsed: model };
}
