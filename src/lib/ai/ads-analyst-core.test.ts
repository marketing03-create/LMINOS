import { describe, expect, it } from "vitest";
import {
  ANALYST_SYSTEM,
  buildAnalystContext,
  buildAnalystPrompt,
  PROPOSALS_SCHEMA,
} from "./ads-analyst-core";

const range = {
  start: new Date("2026-03-01T00:00:00.000Z"),
  end: new Date("2026-06-01T00:00:00.000Z"),
};

const baseInput = {
  account: {
    displayName: "Flexifund Capital",
    externalAccountId: "5998534374",
    website: "flexi_fund_capital",
  },
  range,
  daily: [
    { date: "2026-05-01", spend: 100, impressions: 1000, clicks: 50, conversions: 2 },
    { date: "2026-05-02", spend: 50, impressions: 500, clicks: 25, conversions: 0 },
  ],
  campaigns: [
    { name: "Search | Loan", date: "", spend: 150, impressions: 1500, clicks: 75, conversions: 2 },
  ],
  keywords: [
    {
      keywordText: "personal loan kl",
      matchType: "PHRASE",
      campaignName: "Search | Loan",
      spend: 80,
      impressions: 800,
      clicks: 40,
      conversions: 2,
    },
  ],
  wasted: [
    { term: "21huat", campaignName: "Search | Loan", spend: 30, clicks: 10, impressions: 200 },
    { term: "luckin33", campaignName: "Search | Loan", spend: 20, clicks: 8, impressions: 150 },
  ],
  realOutcomes: { leads: 40, approved: 3, revenue: 20000, realRoas: 1.1 },
};

describe("PROPOSALS_SCHEMA", () => {
  it("accepts a well-formed proposal set", () => {
    const parsed = PROPOSALS_SCHEMA.safeParse({
      proposals: [
        {
          type: "add_negative_keyword",
          target: "21huat",
          change: "Add '21huat' as an exact negative keyword.",
          rationale: "Spent RM30 over 10 clicks with 0 conversions.",
          projectedImpact: "Stops ~RM30/period of wasted spend.",
          riskTier: "low",
          confidence: "high",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown proposal type", () => {
    const parsed = PROPOSALS_SCHEMA.safeParse({
      proposals: [
        {
          type: "delete_campaign",
          target: "x",
          change: "x",
          rationale: "x",
          projectedImpact: "x",
          riskTier: "low",
          confidence: "low",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid risk tier", () => {
    const parsed = PROPOSALS_SCHEMA.safeParse({
      proposals: [
        {
          type: "pause_keyword",
          target: "x",
          change: "x",
          rationale: "x",
          projectedImpact: "x",
          riskTier: "catastrophic",
          confidence: "low",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an empty proposal list", () => {
    expect(PROPOSALS_SCHEMA.safeParse({ proposals: [] }).success).toBe(true);
  });
});

describe("buildAnalystContext", () => {
  it("sums daily totals and derives ctr/avgCpc", () => {
    const ctx = buildAnalystContext(baseInput);
    expect(ctx.totals.spend).toBe(150);
    expect(ctx.totals.impressions).toBe(1500);
    expect(ctx.totals.clicks).toBe(75);
    expect(ctx.totals.conversions).toBe(2);
    expect(ctx.totals.ctr).toBe(0.05); // 75 / 1500
    expect(ctx.totals.avgCpc).toBe(2); // 150 / 75
  });

  it("maps wasted search terms (negative-keyword candidates)", () => {
    const ctx = buildAnalystContext(baseInput);
    expect(ctx.wastedSearchTerms.map((w) => w.term)).toEqual(["21huat", "luckin33"]);
    expect(ctx.wastedSearchTerms[0]).toMatchObject({ spend: 30, clicks: 10 });
  });

  it("flags sparse outcomes as low confidence and computes lead quality", () => {
    const ctx = buildAnalystContext(baseInput);
    expect(ctx.realOutcomes).not.toBeNull();
    expect(ctx.realOutcomes?.leadQuality).toBe(1.5); // approved 3 / conversions 2
    expect(ctx.realOutcomes?.note).toContain("LOW confidence");
  });

  it("returns null outcomes when none provided", () => {
    const ctx = buildAnalystContext({ ...baseInput, realOutcomes: null });
    expect(ctx.realOutcomes).toBeNull();
  });

  it("uses the period from the date range", () => {
    const ctx = buildAnalystContext(baseInput);
    expect(ctx.period).toEqual({ start: "2026-03-01", end: "2026-06-01" });
  });
});

describe("buildAnalystPrompt", () => {
  it("embeds the context JSON and references the account data", () => {
    const ctx = buildAnalystContext(baseInput);
    const prompt = buildAnalystPrompt(ctx);
    expect(prompt).toContain("DATA (JSON):");
    expect(prompt).toContain("21huat");
    expect(prompt).toContain("flexi_fund_capital");
  });

  it("system prompt states the wasted-term + budget-cap rules", () => {
    expect(ANALYST_SYSTEM).toContain("add_negative_keyword");
    expect(ANALYST_SYSTEM).toContain("±30%");
  });
});
