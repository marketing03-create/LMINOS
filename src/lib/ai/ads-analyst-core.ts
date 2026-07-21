/**
 * Pure (DB-free) core of the AI Google Ads analyst: the proposal Zod schema,
 * the context builder, and the prompt. Kept separate from ads-analyst.ts so it
 * can be unit-tested without pulling in the DB client (type-only imports below
 * are erased at compile time). See parse-account-csv.ts for the same pattern.
 */
import { z } from "zod";
import type {
  CampaignMetricRow,
  DailyMetricRow,
  KeywordRow,
  WastedTermRow,
} from "@/lib/ads/account-metrics";
import type { DateRange } from "@/lib/roas/aggregate";

export const DEFAULT_ADS_ANALYST_MODEL = "anthropic/claude-opus-4-8";

export const PROPOSAL_TYPES = [
  "add_negative_keyword",
  "pause_keyword",
  "adjust_budget",
  "new_ad_copy",
  "monitor_term",
] as const;
export const RISK_TIERS = ["low", "medium", "high"] as const;
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

/** One proposed change. Forced JSON via generateObject — no parsing needed. */
export const ProposalItemSchema = z.object({
  type: z.enum(PROPOSAL_TYPES),
  target: z
    .string()
    .describe("Exact subject of the change: keyword text, search term, or campaign name."),
  change: z.string().describe("The concrete change to make, in one sentence."),
  rationale: z.string().describe("Why — cite the specific numbers from the data."),
  projectedImpact: z
    .string()
    .describe("Brief estimate of the effect, e.g. 'stops ~RM280/period of 0-conversion spend'."),
  riskTier: z.enum(RISK_TIERS),
  confidence: z.enum(CONFIDENCE_LEVELS),
});
export type ProposalItem = z.infer<typeof ProposalItemSchema>;

export const PROPOSALS_SCHEMA = z.object({
  proposals: z.array(ProposalItemSchema),
});

export type AnalystContext = {
  account: { name: string; externalId: string; website: string | null };
  period: { start: string; end: string };
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number | null;
    avgCpc: number | null;
  };
  realOutcomes: {
    leads: number;
    approved: number;
    revenue: number;
    realRoas: number | null;
    leadQuality: number | null;
    note: string;
  } | null;
  campaigns: { name: string; spend: number; clicks: number; conversions: number }[];
  topKeywords: {
    keyword: string;
    matchType: string | null;
    spend: number;
    clicks: number;
    conversions: number;
  }[];
  wastedSearchTerms: {
    term: string;
    campaign: string | null;
    spend: number;
    clicks: number;
  }[];
};

const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export function buildAnalystContext(input: {
  account: { displayName: string; externalAccountId: string; website: string | null };
  range: DateRange;
  daily: DailyMetricRow[];
  campaigns: CampaignMetricRow[];
  keywords: KeywordRow[];
  wasted: WastedTermRow[];
  realOutcomes: {
    leads: number;
    approved: number;
    revenue: number;
    realRoas: number | null;
  } | null;
}): AnalystContext {
  const t = input.daily.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      conversions: a.conversions + r.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  let realOutcomes: AnalystContext["realOutcomes"] = null;
  if (input.realOutcomes) {
    const o = input.realOutcomes;
    const leadQuality =
      t.conversions > 0 ? round(o.approved / t.conversions, 4) : null;
    realOutcomes = {
      leads: o.leads,
      approved: o.approved,
      revenue: round(o.revenue),
      realRoas: o.realRoas == null ? null : round(o.realRoas, 3),
      leadQuality,
      note:
        o.approved < 10
          ? "Very few approved loans recorded — treat ROAS/lead-quality as LOW confidence; rely on spend/click/conversion + wasted-term signals."
          : "Outcome data present.",
    };
  }

  return {
    account: {
      name: input.account.displayName,
      externalId: input.account.externalAccountId,
      website: input.account.website,
    },
    period: {
      start: input.range.start.toISOString().slice(0, 10),
      end: input.range.end.toISOString().slice(0, 10),
    },
    totals: {
      spend: round(t.spend),
      impressions: t.impressions,
      clicks: t.clicks,
      conversions: round(t.conversions),
      ctr: t.impressions > 0 ? round(t.clicks / t.impressions, 4) : null,
      avgCpc: t.clicks > 0 ? round(t.spend / t.clicks) : null,
    },
    realOutcomes,
    campaigns: input.campaigns.map((c) => ({
      name: c.name,
      spend: round(c.spend),
      clicks: c.clicks,
      conversions: round(c.conversions),
    })),
    topKeywords: input.keywords.map((k) => ({
      keyword: k.keywordText,
      matchType: k.matchType,
      spend: round(k.spend),
      clicks: k.clicks,
      conversions: round(k.conversions),
    })),
    wastedSearchTerms: input.wasted.map((w) => ({
      term: w.term,
      campaign: w.campaignName,
      spend: round(w.spend),
      clicks: w.clicks,
    })),
  };
}

export const ANALYST_SYSTEM = `You are a Google Ads strategist with 10+ years optimizing paid search for Malaysian, LICENSED personal-loan lenders. You review ONE ad account's real performance data and propose concrete, conservative optimizations the way a seasoned marketer would — judging INTENT and RELEVANCE first, never cutting on raw cost/clicks/conversions alone. Currency is MYR (RM). You read English, Bahasa Malaysia, mixed Malay-English, Indonesian spillover, abbreviations and misspellings, and know how Malaysians search for loans.

GROUND TRUTH: Base EVERY proposal ONLY on the numbers provided. Never invent keywords, terms, campaigns, or metrics that are not in the data. If the data is thin, propose fewer items at lower confidence.

RELEVANCE BEFORE PERFORMANCE — this is the core skill. A wasted search term (spend > 0, 0 conversions) is NOT automatically a negative keyword. First decide whether the term is RELEVANT to a personal-loan offer:
- Clearly UNRELATED / wrong intent → EXCLUDE it: type "add_negative_keyword", riskTier "low". Clear-exclude signals: a product/service the lender does NOT offer; job/career/vacancy intent; pure information/definition/calculator; government aid or "free money"; wrong location; a competitor's brand.
- Relevant, or shows genuine loan/financing intent, but simply hasn't converted YET → DO NOT exclude. Use type "monitor_term" (riskTier "low"): keep it running and watch it. Cutting a relevant term over a little spend throws away future leads. In the rationale say WHY it's relevant and what to do (give it more clicks, check the landing page, or lower the bid).
- MINIMUM-EVIDENCE GUARD: never propose a negative for a RELEVANT term on thin data (roughly < 5 clicks AND < RM20 spend with 0 conversions) — monitor it instead. Only clearly-irrelevant terms may be excluded on small spend.

WORKED EXAMPLE: "lazada tambadana" — RM26.90, 2 clicks, 0 conversions. "tambah dana" means "add funds / financing" — that is loan intent, RELEVANT to the business. Correct call: "monitor_term" (watch it, check the landing page / bid), NOT a negative. Only exclude later if it proves genuinely off-target or keeps wasting spend with clear non-loan intent.

MALAYSIAN CONTEXT (weigh it, don't blindly block): jobs (kerja kosong, jawatan kosong, vacancy, hiring, internship); OTHER financial products the lender may not offer (housing/home/car/motor/business/SME loan, PTPTN, ASB/ASNB financing, credit card); research/informational (maksud, definition, calculator, kiraan, formula, PDF, assignment); government aid (bantuan kerajaan, bantuan tunai, STR, zakat, free money); competitors' brand names.

OTHER PROPOSALS:
- "pause_keyword": only for a keyword in "topKeywords" with meaningful spend and 0 conversions (or far-below-average performance). riskTier "medium".
- "adjust_budget": HIGH risk. Only when a campaign clearly over- or under-performs on real ROAS / lead quality. Cap any change to ±30%, set riskTier "high", and state current vs proposed in the "change".
- "new_ad_copy": optional, riskTier "medium"; only when CTR is clearly weak relative to the account.

"Real ROAS" = approved-loan revenue ÷ spend. "Lead quality" = real approved loans ÷ platform-reported conversions. If realOutcomes is null or based on very few approved deals (see its "note"), treat ROAS/quality as LOW confidence and lean on spend/click/conversion + relevance — say so in the rationale.

For each proposal: "target" = the exact keyword/term/campaign; "change" = one concrete sentence (for "monitor_term", e.g. "Keep running and monitor — relevant loan intent, no conversions yet"); "rationale" = cite the specific numbers AND your relevance judgement; "projectedImpact" = a brief estimate; "confidence" = your data-confidence (low/medium/high).
Return at most ~12 proposals, best first (clearest wins first). If nothing is worth changing, return an empty list.`;

export function buildAnalystPrompt(context: AnalystContext): string {
  return `Analyze this Google Ads account and propose changes per the rules.\n\nDATA (JSON):\n${JSON.stringify(
    context,
    null,
    2
  )}`;
}
