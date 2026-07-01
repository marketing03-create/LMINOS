/**
 * Pure (DB-free) core of the AI Google Ads Account Builder (Feature R): the
 * blueprint Zod schema (with Google's hard limits encoded so the model can't
 * exceed them), the compliance-aware system prompt, the context/prompt
 * builders, and `blueprintToBuildSteps` — the pure translator from the AI's
 * blueprint tree to the ordered Google Ads REST `:mutate` operations.
 *
 * Kept separate from ads-planner.ts so it's unit-testable without the DB or any
 * model call (same pattern as ads-analyst-core.ts).
 */
import { z } from "zod";

export const DEFAULT_ADS_PLANNER_MODEL = "anthropic/claude-opus-4-8";

export const BIDDING_STRATEGIES = [
  "MANUAL_CPC",
  "MAXIMIZE_CLICKS",
  "MAXIMIZE_CONVERSIONS",
] as const;
export const MATCH_TYPES = ["EXACT", "PHRASE", "BROAD"] as const;
export const LANGUAGES = ["en", "ms", "zh"] as const;
export const CONVERSION_CATEGORIES = ["lead", "signup", "contact", "default"] as const;

// ── Blueprint schema (Google hard limits encoded) ───────────────────────────
const KeywordSchema = z.object({
  text: z.string().min(1).max(80),
  matchType: z.enum(MATCH_TYPES),
});

const RsaSchema = z.object({
  // Google RSA: 3–15 headlines (≤30 chars), 2–4 descriptions (≤90), paths ≤15.
  headlines: z.array(z.string().min(1).max(30)).min(3).max(15),
  descriptions: z.array(z.string().min(1).max(90)).min(2).max(4),
  path1: z.string().max(15).optional(),
  path2: z.string().max(15).optional(),
});

const AdGroupSchema = z.object({
  name: z.string().min(1).max(120),
  theme: z.string().describe("One line: what this ad group's keywords share."),
  keywords: z.array(KeywordSchema).min(1).max(20),
  ads: z.array(RsaSchema).min(1).max(3),
});

const CampaignSchema = z.object({
  name: z.string().min(1).max(120),
  dailyBudgetMyr: z.number().positive().describe("Daily budget in MYR (RM)."),
  biddingStrategy: z
    .enum(BIDDING_STRATEGIES)
    .describe("Prefer MANUAL_CPC at launch (no conversion data yet)."),
  // Advisory: which areas to target. The build defaults to Malaysia; the human
  // narrows to specific cities in Google Ads. (See blueprintToBuildSteps.)
  geoTargets: z
    .array(z.string())
    .describe("Advisory list of areas to target, e.g. ['Kuala Lumpur','Selangor']."),
  languages: z.array(z.enum(LANGUAGES)).min(1),
  adScheduleNote: z
    .string()
    .describe("Advisory peak-hours note from the golden-hour data (not auto-applied)."),
  negativeKeywords: z
    .array(z.string().min(1).max(80))
    .describe("Seeded from proven wasted search terms + obvious mismatches."),
  adGroups: z.array(AdGroupSchema).min(1).max(5),
});

export const BLUEPRINT_SCHEMA = z.object({
  accountName: z.string().min(1).max(120),
  finalUrl: z.string().url().describe("The landing page (must carry the loan disclosures)."),
  conversionAction: z.object({
    name: z.string().min(1).max(120),
    category: z.enum(CONVERSION_CATEGORIES),
    note: z.string().describe("Reminder that the website tag must be placed by hand."),
  }),
  campaigns: z.array(CampaignSchema).min(1).max(3),
  complianceNotes: z
    .string()
    .describe(
      "How the landing page meets Google's loan rules: physical address, all fees, max APR, a representative total-cost example, and 61-day+ repayment."
    ),
  assumptions: z
    .string()
    .describe("Data-confidence caveats: what was inferred vs. grounded; lower confidence if data is thin."),
});

export type Blueprint = z.infer<typeof BLUEPRINT_SCHEMA>;
export type BlueprintCampaign = z.infer<typeof CampaignSchema>;

// ── Google constants (stable IDs) ───────────────────────────────────────────
/** Stable Google languageConstant IDs. */
const LANGUAGE_CONSTANTS: Record<(typeof LANGUAGES)[number], string> = {
  en: "1000",
  ms: "1102", // Malay
  zh: "1018", // Chinese
};
/** Google geoTargetConstant — Malaysia (country). The build targets the whole
 * country by default; the operator narrows to KL/Selangor/etc. by hand to avoid
 * hardcoding city ids we aren't certain of. */
const MALAYSIA_GEO = "2458";

const CONVERSION_CATEGORY_MAP: Record<(typeof CONVERSION_CATEGORIES)[number], string> = {
  lead: "SUBMIT_LEAD_FORM",
  signup: "SIGNUP",
  contact: "CONTACT",
  default: "DEFAULT",
};

function biddingFields(s: (typeof BIDDING_STRATEGIES)[number]): Record<string, unknown> {
  if (s === "MAXIMIZE_CONVERSIONS") return { maximizeConversions: {} };
  if (s === "MAXIMIZE_CLICKS") return { targetSpend: {} };
  return { manualCpc: { enhancedCpcEnabled: false } };
}

// ── Tree → ordered :mutate operations ───────────────────────────────────────
export const BUILD_STEP_KINDS = [
  "create_customer_client",
  "create_campaign_budget",
  "create_campaign",
  "create_campaign_criterion",
  "create_ad_group",
  "create_ad_group_criterion",
  "create_ad_group_ad",
  "create_conversion_action",
] as const;
export type BuildStepKind = (typeof BUILD_STEP_KINDS)[number];

export type BuildStep = {
  seq: number;
  kind: BuildStepKind;
  requestPayload: Record<string, unknown>; // one Google Ads mutateOperation
};

/** Placeholder substituted with the real customer id at validate/build time. */
export const CID_PLACEHOLDER = "__CID__";

/**
 * Translate a blueprint into the ordered list of Google Ads `:mutate`
 * operations (one per build step). Uses negative temp resource names so the
 * whole account builds in one batch with intra-batch references (budget ←
 * campaign ← ad group ← keyword/ad). Campaigns + ads are created PAUSED so a
 * build never spends. Pass the real customer id; otherwise CID_PLACEHOLDER is
 * baked in and substituted later.
 */
export function blueprintToBuildSteps(
  blueprint: Blueprint,
  opts: { customerId?: string } = {}
): BuildStep[] {
  const cid = opts.customerId && opts.customerId.length ? opts.customerId : CID_PLACEHOLDER;
  const steps: BuildStep[] = [];
  let seq = 1;
  let temp = -1;
  const nextTemp = () => temp--; // returns current, then decrements
  const res = (collection: string, id: number | string) =>
    `customers/${cid}/${collection}/${id}`;

  // Account-level conversion action first (independent of campaigns).
  if (blueprint.conversionAction) {
    steps.push({
      seq: seq++,
      kind: "create_conversion_action",
      requestPayload: {
        conversionActionOperation: {
          create: {
            name: blueprint.conversionAction.name,
            type: "WEBPAGE",
            category: CONVERSION_CATEGORY_MAP[blueprint.conversionAction.category],
            status: "ENABLED",
            primaryForGoal: true,
          },
        },
      },
    });
  }

  for (const c of blueprint.campaigns) {
    const budgetRes = res("campaignBudgets", nextTemp());
    steps.push({
      seq: seq++,
      kind: "create_campaign_budget",
      requestPayload: {
        campaignBudgetOperation: {
          create: {
            resourceName: budgetRes,
            name: `${c.name} — budget`,
            amountMicros: String(Math.round(c.dailyBudgetMyr * 1_000_000)),
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        },
      },
    });

    const campaignRes = res("campaigns", nextTemp());
    steps.push({
      seq: seq++,
      kind: "create_campaign",
      requestPayload: {
        campaignOperation: {
          create: {
            resourceName: campaignRes,
            name: c.name,
            status: "PAUSED", // never spends until a human un-pauses
            advertisingChannelType: "SEARCH",
            campaignBudget: budgetRes,
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
              targetContentNetwork: false,
              targetPartnerSearchNetwork: false,
            },
            ...biddingFields(c.biddingStrategy),
          },
        },
      },
    });

    // Geo (Malaysia by default) + language targeting.
    steps.push({
      seq: seq++,
      kind: "create_campaign_criterion",
      requestPayload: {
        campaignCriterionOperation: {
          create: {
            campaign: campaignRes,
            location: { geoTargetConstant: `geoTargetConstants/${MALAYSIA_GEO}` },
          },
        },
      },
    });
    for (const l of c.languages) {
      steps.push({
        seq: seq++,
        kind: "create_campaign_criterion",
        requestPayload: {
          campaignCriterionOperation: {
            create: {
              campaign: campaignRes,
              language: { languageConstant: `languageConstants/${LANGUAGE_CONSTANTS[l]}` },
            },
          },
        },
      });
    }

    // Campaign-level negative keywords.
    for (const nk of c.negativeKeywords) {
      steps.push({
        seq: seq++,
        kind: "create_campaign_criterion",
        requestPayload: {
          campaignCriterionOperation: {
            create: {
              campaign: campaignRes,
              negative: true,
              keyword: { text: nk, matchType: "BROAD" },
            },
          },
        },
      });
    }

    for (const ag of c.adGroups) {
      const agRes = res("adGroups", nextTemp());
      steps.push({
        seq: seq++,
        kind: "create_ad_group",
        requestPayload: {
          adGroupOperation: {
            create: {
              resourceName: agRes,
              name: ag.name,
              campaign: campaignRes,
              status: "ENABLED",
              type: "SEARCH_STANDARD",
            },
          },
        },
      });

      for (const kw of ag.keywords) {
        steps.push({
          seq: seq++,
          kind: "create_ad_group_criterion",
          requestPayload: {
            adGroupCriterionOperation: {
              create: {
                adGroup: agRes,
                status: "ENABLED",
                keyword: { text: kw.text, matchType: kw.matchType },
              },
            },
          },
        });
      }

      for (const ad of ag.ads) {
        steps.push({
          seq: seq++,
          kind: "create_ad_group_ad",
          requestPayload: {
            adGroupAdOperation: {
              create: {
                adGroup: agRes,
                status: "PAUSED",
                ad: {
                  finalUrls: [blueprint.finalUrl],
                  responsiveSearchAd: {
                    headlines: ad.headlines.map((t) => ({ text: t })),
                    descriptions: ad.descriptions.map((t) => ({ text: t })),
                    ...(ad.path1 ? { path1: ad.path1 } : {}),
                    ...(ad.path2 ? { path2: ad.path2 } : {}),
                  },
                },
              },
            },
          },
        });
      }
    }
  }

  return steps;
}

/**
 * Server guardrail: scale campaign daily budgets so their SUM never exceeds the
 * total daily cap (MYR). Proportional scale-down, floored at RM1 per campaign.
 * No-op when no cap is set or the plan is already within budget.
 */
export function clampBudgets(blueprint: Blueprint, capMyrPerDay: number | null): Blueprint {
  if (!capMyrPerDay || capMyrPerDay <= 0) return blueprint;
  const total = blueprint.campaigns.reduce((a, c) => a + c.dailyBudgetMyr, 0);
  if (total <= capMyrPerDay) return blueprint;
  const factor = capMyrPerDay / total;
  return {
    ...blueprint,
    campaigns: blueprint.campaigns.map((c) => ({
      ...c,
      dailyBudgetMyr: Math.max(1, Math.round(c.dailyBudgetMyr * factor * 100) / 100),
    })),
  };
}

/** Roll-up counts + total daily budget for the UI / guardrail checks. */
export function summarizeBlueprint(blueprint: Blueprint) {
  let adGroups = 0;
  let keywords = 0;
  let ads = 0;
  let negatives = 0;
  let totalDailyBudgetMyr = 0;
  for (const c of blueprint.campaigns) {
    totalDailyBudgetMyr += c.dailyBudgetMyr;
    negatives += c.negativeKeywords.length;
    adGroups += c.adGroups.length;
    for (const ag of c.adGroups) {
      keywords += ag.keywords.length;
      ads += ag.ads.length;
    }
  }
  return {
    campaigns: blueprint.campaigns.length,
    adGroups,
    keywords,
    ads,
    negatives,
    totalDailyBudgetMyr: Math.round(totalDailyBudgetMyr * 100) / 100,
  };
}

// ── Context + prompt ────────────────────────────────────────────────────────
export type PlannerContext = {
  business: {
    website: string;
    destinationUrl: string;
    market: string;
    currency: string;
  };
  budgetCapMyrPerDay: number | null;
  provenKeywords: {
    keyword: string;
    matchType: string | null;
    clicks: number;
    conversions: number;
    spend: number;
  }[];
  provenWastedTerms: { term: string; spend: number; clicks: number }[];
  goldenHours: string;
  websitePerformance: {
    leads: number;
    approved: number;
    revenue: number;
    realRoas: number | null;
  } | null;
  dataConfidence: string;
};

const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export function buildPlannerContext(input: {
  website: string;
  destinationUrl: string;
  budgetCapMyrPerDay: number | null;
  provenKeywords: PlannerContext["provenKeywords"];
  provenWastedTerms: PlannerContext["provenWastedTerms"];
  goldenHours: string;
  websitePerformance: PlannerContext["websitePerformance"];
}): PlannerContext {
  const thin = input.provenKeywords.length < 10;
  return {
    business: {
      website: input.website,
      destinationUrl: input.destinationUrl,
      market: "Malaysia",
      currency: "MYR",
    },
    budgetCapMyrPerDay: input.budgetCapMyrPerDay,
    provenKeywords: input.provenKeywords.map((k) => ({
      keyword: k.keyword,
      matchType: k.matchType,
      clicks: k.clicks,
      conversions: round(k.conversions),
      spend: round(k.spend),
    })),
    provenWastedTerms: input.provenWastedTerms.map((w) => ({
      term: w.term,
      spend: round(w.spend),
      clicks: w.clicks,
    })),
    goldenHours: input.goldenHours,
    websitePerformance: input.websitePerformance
      ? {
          leads: input.websitePerformance.leads,
          approved: input.websitePerformance.approved,
          revenue: round(input.websitePerformance.revenue),
          realRoas:
            input.websitePerformance.realRoas == null
              ? null
              : round(input.websitePerformance.realRoas, 3),
        }
      : null,
    dataConfidence: thin
      ? "SPARSE proven-keyword data — draft a tighter, smaller account and lower confidence in `assumptions`."
      : "Sufficient proven data — ground the plan in it.",
  };
}

export const PLANNER_SYSTEM = `You are a senior Google Ads strategist for a Malaysian, LICENSED personal-loan marketing company. You draft a complete, launch-ready SEARCH account for ONE landing page (website), to be reviewed and approved by a human before anything is built. Currency is MYR (RM).

HARD RULES:
- Ground keywords and negative keywords ONLY in the supplied proven data (provenKeywords = what already converts across the company's accounts; provenWastedTerms = money-wasting search terms to exclude). Do not invent generic loan keywords that aren't supported by the data. If data is thin (see dataConfidence), draft a SMALLER, tighter account and say so in "assumptions".
- COMPLIANCE (Google personal-loans policy — non-negotiable): the landing page must disclose the physical business address, all fees, the maximum APR, and a representative total-cost example, and only loans repayable in 61 days or more are allowed. Reflect this in "complianceNotes". Ad copy must NOT claim "guaranteed approval", "no credit check", instant cash, or misleading rates; frame as a licensed lender. Keep every headline ≤30 chars and description ≤90 chars (the schema enforces this).
- Structure: 1–3 campaigns; each campaign 2–5 tightly-themed ad groups; each ad group 5–20 keywords (proven first) and 1–2 responsive search ads with ≥10 headlines and ≥3 descriptions for strong Ad Strength. Seed campaign-level negativeKeywords from provenWastedTerms plus obvious mismatches (free, scam, job, salary-slip-less, etc. ONLY if they appear as wasted terms or are clearly irrelevant).
- Budget: conservative launch daily budgets. If budgetCapMyrPerDay is set, the SUM of all campaign dailyBudgetMyr must stay at or under it. Prefer biddingStrategy "MANUAL_CPC" at launch because the conversion tag is not yet live (no conversion history to optimize on).
- Targeting: set languages from the audience (en + ms typically, add zh if relevant). geoTargets is advisory (the build targets Malaysia; the human narrows to cities). adScheduleNote should summarize the golden-hour peak windows from the data.
- conversionAction: define a lead conversion (category "lead") and remind in its "note" that the website tracking tag must be placed by hand for it to fire.
- Output exactly one coherent account via the provided schema. Be concrete and concise.`;

export function buildPlannerPrompt(context: PlannerContext): string {
  return `Draft a launch-ready Google Ads account for this landing page, per the rules.\n\nDATA (JSON):\n${JSON.stringify(
    context,
    null,
    2
  )}`;
}
