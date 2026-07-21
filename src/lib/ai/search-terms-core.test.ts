import { describe, expect, it } from "vitest";
import {
  buildSearchTermsContext,
  buildSearchTermsPrompt,
  deterministicHints,
  DEFAULT_ANALYSIS_SETTINGS,
  finalizeDecision,
  overlapWarning,
  SEARCH_TERMS_BATCH_SCHEMA,
  SEARCH_TERMS_SYSTEM,
  type AnalysisSettings,
} from "./search-terms-core";

const okResult = {
  search_term: "personal loan kl",
  language: "English",
  intent_category: "commercial_loan",
  commercial_intent: "high" as const,
  relevance_score: 92,
  decision: "KEEP" as const,
  reason: "Strong commercial intent, on-service, supported location.",
  suggested_negative_keyword: "",
  suggested_match_type: "NONE" as const,
  suggested_level: "NONE" as const,
  risk_level: "LOW" as const,
  risk_explanation: "n/a",
  confidence_score: 90,
  needs_human_review: false,
  recommendation_type: "MONITOR_ONLY" as const,
};

describe("SEARCH_TERMS_BATCH_SCHEMA", () => {
  it("accepts a well-formed batch", () => {
    expect(
      SEARCH_TERMS_BATCH_SCHEMA.safeParse({ results: [okResult] }).success
    ).toBe(true);
  });
  it("accepts an empty batch", () => {
    expect(SEARCH_TERMS_BATCH_SCHEMA.safeParse({ results: [] }).success).toBe(true);
  });
  it("rejects an unknown decision", () => {
    const bad = { ...okResult, decision: "DELETE" };
    expect(SEARCH_TERMS_BATCH_SCHEMA.safeParse({ results: [bad] }).success).toBe(false);
  });
  it("rejects an unknown match type", () => {
    const bad = { ...okResult, suggested_match_type: "SUPER_BROAD" };
    expect(SEARCH_TERMS_BATCH_SCHEMA.safeParse({ results: [bad] }).success).toBe(false);
  });
  it("rejects an unknown level", () => {
    const bad = { ...okResult, suggested_level: "UNIVERSE" };
    expect(SEARCH_TERMS_BATCH_SCHEMA.safeParse({ results: [bad] }).success).toBe(false);
  });
  it("rejects relevance_score out of range", () => {
    const bad = { ...okResult, relevance_score: 140 };
    expect(SEARCH_TERMS_BATCH_SCHEMA.safeParse({ results: [bad] }).success).toBe(false);
  });
  it("rejects a missing required field", () => {
    const { reason: _omit, ...bad } = okResult;
    void _omit;
    expect(SEARCH_TERMS_BATCH_SCHEMA.safeParse({ results: [bad] }).success).toBe(false);
  });
});

const settings: AnalysisSettings = {
  ...DEFAULT_ANALYSIS_SETTINGS,
  competitorStrategy: "EXCLUDE_ALL",
  brandNames: ["FlexiFund", "Flexi Fund Capital"],
  servicesNotOffered: ["business loan", "sme loan"],
  unsupportedLocations: ["johor", "penang"],
  supportedLocations: ["kuala lumpur", "selangor"],
  minClicksBeforeExclude: 5,
  minCostBeforeExcludeMyr: 20,
};

describe("deterministicHints", () => {
  it("flags the advertiser's own brand", () => {
    const h = deterministicHints({ term: "flexifund loan", clicks: 3, spend: 5 }, settings);
    expect(h.brandMatch).toBe(true);
    expect(h.hints.join(" ")).toMatch(/brand protection/i);
  });
  it("flags below-exclude-threshold on thin data", () => {
    const h = deterministicHints({ term: "personal loan kl", clicks: 1, spend: 3 }, settings);
    expect(h.belowExcludeThreshold).toBe(true);
  });
  it("does not flag below-threshold once clicks/cost are high enough", () => {
    const h = deterministicHints({ term: "business loan", clicks: 40, spend: 300 }, settings);
    expect(h.belowExcludeThreshold).toBe(false);
    expect(h.hints.join(" ")).toMatch(/does NOT offer/i);
  });
  it("always surfaces the competitor strategy", () => {
    const h = deterministicHints({ term: "aeon credit loan", clicks: 2, spend: 8 }, settings);
    expect(h.hints.join(" ")).toContain("EXCLUDE_ALL");
  });
});

describe("finalizeDecision (deterministic guards)", () => {
  it("brand protection: own-brand EXCLUDE is overridden to KEEP", () => {
    const out = finalizeDecision(
      { decision: "EXCLUDE", relevance_score: 20 },
      { brandMatch: true, belowExcludeThreshold: false }
    );
    expect(out.decision).toBe("KEEP");
    expect(out.ruleApplied).toBe("brand_protection");
  });
  it("min-evidence guard: a still-relevant EXCLUDE on thin data becomes MONITOR", () => {
    const out = finalizeDecision(
      { decision: "EXCLUDE", relevance_score: 70 },
      { brandMatch: false, belowExcludeThreshold: true }
    );
    expect(out.decision).toBe("MONITOR");
    expect(out.ruleApplied).toBe("min_evidence_guard");
  });
  it("irrelevant term with thin data still EXCLUDEs (relevance < 40)", () => {
    const out = finalizeDecision(
      { decision: "EXCLUDE", relevance_score: 15 },
      { brandMatch: false, belowExcludeThreshold: true }
    );
    expect(out.decision).toBe("EXCLUDE");
    expect(out.ruleApplied).toBeNull();
  });
  it("passes a normal KEEP through untouched", () => {
    const out = finalizeDecision(
      { decision: "KEEP", relevance_score: 90 },
      { brandMatch: false, belowExcludeThreshold: false }
    );
    expect(out.decision).toBe("KEEP");
    expect(out.ruleApplied).toBeNull();
  });
});

describe("overlapWarning", () => {
  it("warns when a PHRASE/BROAD negative appears inside a converting term", () => {
    const w = overlapWarning({
      negative: "loan",
      matchType: "PHRASE",
      brandNames: [],
      convertingPhrases: ["personal loan kl", "fast loan"],
    });
    expect(w).toMatch(/CONVERTING/);
    expect(w).toMatch(/personal loan kl/);
  });
  it("does NOT collide an EXACT negative with a longer converting phrase", () => {
    const w = overlapWarning({
      negative: "loan",
      matchType: "EXACT",
      brandNames: [],
      convertingPhrases: ["personal loan kl"],
    });
    expect(w).toBeNull();
  });
  it("warns on brand overlap regardless of match type", () => {
    const w = overlapWarning({
      negative: "flexifund",
      matchType: "EXACT",
      brandNames: ["FlexiFund"],
      convertingPhrases: [],
    });
    expect(w).toMatch(/brand/i);
  });
  it("returns null for a clean, non-overlapping negative", () => {
    const w = overlapWarning({
      negative: "kerja kosong",
      matchType: "PHRASE",
      brandNames: ["FlexiFund"],
      convertingPhrases: ["personal loan kl"],
    });
    expect(w).toBeNull();
  });
});

describe("prompt + context", () => {
  it("system prompt carries the injection guard + decision definitions", () => {
    expect(SEARCH_TERMS_SYSTEM).toMatch(/UNTRUSTED DATA/);
    expect(SEARCH_TERMS_SYSTEM).toMatch(/ignore previous instructions/i);
    expect(SEARCH_TERMS_SYSTEM).toContain("EXCLUDE:");
    expect(SEARCH_TERMS_SYSTEM).toMatch(/brand.*never EXCLUDE/i);
  });
  it("prompt fences data and includes the terms", () => {
    const ctx = buildSearchTermsContext({
      account: { displayName: "Acc", externalAccountId: "123", website: null },
      campaignScope: "all campaigns",
      range: { start: new Date("2026-07-01"), end: new Date("2026-07-08") },
      settings,
      terms: [
        {
          term: "kerja kosong loan company",
          campaignExternalId: "c1",
          campaignName: "Search",
          status: "NONE",
          spend: 12,
          clicks: 4,
          impressions: 100,
          conversions: 0,
          ctr: 0.04,
          avgCpc: 3,
          costPerConv: null,
        },
      ],
    });
    const prompt = buildSearchTermsPrompt(ctx);
    expect(prompt).toContain("DATA (JSON):");
    expect(prompt).toContain("kerja kosong loan company");
    expect(ctx.terms[0].rule_hints.join(" ")).toContain("EXCLUDE_ALL");
  });
});
