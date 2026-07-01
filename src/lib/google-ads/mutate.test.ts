import { describe, expect, it } from "vitest";
import { removeOp, substituteCid } from "./mutate";
import { CID_PLACEHOLDER } from "@/lib/ai/ads-planner-core";

describe("substituteCid", () => {
  it("replaces the CID placeholder in nested resource names", () => {
    const payload = {
      campaignOperation: {
        create: {
          resourceName: `customers/${CID_PLACEHOLDER}/campaigns/-2`,
          campaignBudget: `customers/${CID_PLACEHOLDER}/campaignBudgets/-1`,
        },
      },
    };
    const out = substituteCid(payload, "123-456-7890");
    expect(out.campaignOperation.create.resourceName).toBe(
      "customers/1234567890/campaigns/-2"
    );
    expect(out.campaignOperation.create.campaignBudget).toBe(
      "customers/1234567890/campaignBudgets/-1"
    );
  });
});

describe("removeOp", () => {
  it("maps each create kind to its remove operation", () => {
    expect(removeOp("create_campaign", "customers/1/campaigns/9")).toEqual({
      campaignOperation: { remove: "customers/1/campaigns/9" },
    });
    expect(
      removeOp("create_ad_group_ad", "customers/1/adGroupAds/9~8")
    ).toEqual({ adGroupAdOperation: { remove: "customers/1/adGroupAds/9~8" } });
  });

  it("returns null for non-revertible kinds or empty resource names", () => {
    expect(removeOp("create_customer_client", "x")).toBeNull();
    expect(removeOp("create_campaign", "")).toBeNull();
  });
});
