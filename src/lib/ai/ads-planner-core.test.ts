import { describe, expect, it } from "vitest";
import {
  BLUEPRINT_SCHEMA,
  PLANNER_SYSTEM,
  blueprintToBuildSteps,
  buildPlannerContext,
  buildPlannerPrompt,
  summarizeBlueprint,
  type Blueprint,
} from "./ads-planner-core";

const sample: Blueprint = {
  accountName: "Flexifund — KL Personal Loans",
  finalUrl: "https://flexifund.example.com/apply",
  conversionAction: {
    name: "Loan Lead",
    category: "lead",
    note: "Place the gtag on the thank-you page (manual).",
  },
  campaigns: [
    {
      name: "Search | Personal Loan | KL",
      dailyBudgetMyr: 50,
      biddingStrategy: "MANUAL_CPC",
      geoTargets: ["Kuala Lumpur", "Selangor"],
      languages: ["en", "ms"],
      adScheduleNote: "Weekday clicks peak 2pm–10pm.",
      negativeKeywords: ["free", "job"],
      adGroups: [
        {
          name: "Personal Loan KL",
          theme: "Personal loan KL intent",
          keywords: [
            { text: "personal loan kl", matchType: "PHRASE" },
            { text: "pinjaman peribadi", matchType: "PHRASE" },
          ],
          ads: [
            {
              headlines: [
                "Licensed Personal Loans",
                "Fast KL Loan Approval",
                "Apply Online Today",
              ],
              descriptions: [
                "Licensed lender in KL. Clear fees and APR shown.",
                "Repayment from 12 months. Apply in minutes.",
              ],
              path1: "loan",
              path2: "kl",
            },
          ],
        },
      ],
    },
  ],
  complianceNotes:
    "Landing page shows address, fees, max APR, and a representative example; loans repayable 12+ months.",
  assumptions: "Grounded in proven KL keywords.",
};

describe("BLUEPRINT_SCHEMA", () => {
  it("accepts a well-formed blueprint", () => {
    expect(BLUEPRINT_SCHEMA.safeParse(sample).success).toBe(true);
  });

  it("rejects more than 15 headlines", () => {
    const bad = structuredClone(sample);
    bad.campaigns[0].adGroups[0].ads[0].headlines = Array.from(
      { length: 16 },
      (_, i) => `Headline ${i}`
    );
    expect(BLUEPRINT_SCHEMA.safeParse(bad).success).toBe(false);
  });

  it("rejects a headline longer than 30 chars", () => {
    const bad = structuredClone(sample);
    bad.campaigns[0].adGroups[0].ads[0].headlines[0] =
      "This headline is definitely far too long for Google";
    expect(BLUEPRINT_SCHEMA.safeParse(bad).success).toBe(false);
  });

  it("rejects an ad group with no keywords", () => {
    const bad = structuredClone(sample);
    bad.campaigns[0].adGroups[0].keywords = [];
    expect(BLUEPRINT_SCHEMA.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid match type", () => {
    const bad = structuredClone(sample) as unknown as {
      campaigns: { adGroups: { keywords: { matchType: string }[] }[] }[];
    };
    bad.campaigns[0].adGroups[0].keywords[0].matchType = "FUZZY";
    expect(BLUEPRINT_SCHEMA.safeParse(bad).success).toBe(false);
  });
});

describe("blueprintToBuildSteps", () => {
  it("emits ordered ops with valid intra-batch references and the customer id", () => {
    const steps = blueprintToBuildSteps(sample, { customerId: "1234567890" });
    const kinds = steps.map((s) => s.kind);

    // conversion action first, then budget before campaign.
    expect(kinds[0]).toBe("create_conversion_action");
    const budgetIdx = kinds.indexOf("create_campaign_budget");
    const campaignIdx = kinds.indexOf("create_campaign");
    expect(budgetIdx).toBeLessThan(campaignIdx);

    // seq is strictly increasing from 1.
    expect(steps.map((s) => s.seq)).toEqual(steps.map((_, i) => i + 1));

    // campaign references the budget's temp resource name, is PAUSED + SEARCH.
    const budgetOp = steps[budgetIdx].requestPayload.campaignBudgetOperation as {
      create: { resourceName: string };
    };
    const campaignOp = steps[campaignIdx].requestPayload.campaignOperation as {
      create: { campaignBudget: string; status: string; advertisingChannelType: string };
    };
    expect(campaignOp.create.campaignBudget).toBe(budgetOp.create.resourceName);
    expect(budgetOp.create.resourceName).toContain("customers/1234567890/campaignBudgets/-");
    expect(campaignOp.create.status).toBe("PAUSED");
    expect(campaignOp.create.advertisingChannelType).toBe("SEARCH");

    // ad group references the campaign; RSA carries the final url + PAUSED.
    const agStep = steps.find((s) => s.kind === "create_ad_group")!;
    const agOp = agStep.requestPayload.adGroupOperation as {
      create: { campaign: string; resourceName: string };
    };
    expect(agOp.create.campaign).toContain("customers/1234567890/campaigns/-");
    const adStep = steps.find((s) => s.kind === "create_ad_group_ad")!;
    const adOp = adStep.requestPayload.adGroupAdOperation as {
      create: { status: string; adGroup: string; ad: { finalUrls: string[] } };
    };
    expect(adOp.create.status).toBe("PAUSED");
    expect(adOp.create.adGroup).toBe(agOp.create.resourceName);
    expect(adOp.create.ad.finalUrls).toEqual([sample.finalUrl]);
  });

  it("uses the placeholder when no customer id is given", () => {
    const steps = blueprintToBuildSteps(sample);
    const budgetOp = steps.find((s) => s.kind === "create_campaign_budget")!
      .requestPayload.campaignBudgetOperation as { create: { resourceName: string } };
    expect(budgetOp.create.resourceName).toContain("customers/__CID__/");
  });
});

describe("summarizeBlueprint", () => {
  it("counts campaigns/ad groups/keywords/ads and total budget", () => {
    const s = summarizeBlueprint(sample);
    expect(s).toMatchObject({
      campaigns: 1,
      adGroups: 1,
      keywords: 2,
      ads: 1,
      negatives: 2,
      totalDailyBudgetMyr: 50,
    });
  });
});

describe("buildPlannerContext + prompt + system", () => {
  it("flags thin proven-keyword data", () => {
    const ctx = buildPlannerContext({
      website: "flexi_fund_capital",
      destinationUrl: "https://x.example.com",
      budgetCapMyrPerDay: 50,
      provenKeywords: [
        { keyword: "personal loan kl", matchType: "PHRASE", clicks: 40, conversions: 3, spend: 80 },
      ],
      provenWastedTerms: [{ term: "21huat", spend: 30, clicks: 10 }],
      goldenHours: "Weekday peak 2pm–10pm.",
      websitePerformance: { leads: 40, approved: 3, revenue: 20000, realRoas: 1.1 },
    });
    expect(ctx.dataConfidence).toContain("SPARSE");
    expect(ctx.business.currency).toBe("MYR");
    const prompt = buildPlannerPrompt(ctx);
    expect(prompt).toContain("DATA (JSON):");
    expect(prompt).toContain("21huat");
  });

  it("system prompt states the loan-compliance + structure rules", () => {
    expect(PLANNER_SYSTEM).toContain("61 days");
    expect(PLANNER_SYSTEM).toContain("APR");
    expect(PLANNER_SYSTEM).toContain("MANUAL_CPC");
  });
});
