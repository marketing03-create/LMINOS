import { describe, expect, it } from "vitest";
import {
  isComplete,
  LOOKBACK_DAYS,
  lookbackWindow,
  METRIC_LABEL,
  missingMetrics,
  REQUIRED_METRICS,
} from "./completeness";

const full = {
  totalLeads: 12,
  filteredLeads: 5,
  directMessages: 30,
  serviceBioViews: 8,
};

describe("missingMetrics / isComplete", () => {
  it("a fully filled live is complete", () => {
    expect(missingMetrics(full)).toEqual([]);
    expect(isComplete(full)).toBe(true);
  });

  it("treats an explicit zero as filled in (not missing)", () => {
    const zeroed = { ...full, directMessages: 0, serviceBioViews: 0 };
    expect(missingMetrics(zeroed)).toEqual([]);
    expect(isComplete(zeroed)).toBe(true);
  });

  it("flags each blank metric by name", () => {
    expect(missingMetrics({ ...full, directMessages: null })).toEqual([
      "directMessages",
    ]);
    expect(
      missingMetrics({ ...full, directMessages: null, serviceBioViews: null })
    ).toEqual(["directMessages", "serviceBioViews"]);
  });

  it("three of four filled is still INCOMPLETE (the key rule)", () => {
    const threeOfFour = { ...full, serviceBioViews: null };
    expect(isComplete(threeOfFour)).toBe(false);
    expect(missingMetrics(threeOfFour)).toEqual(["serviceBioViews"]);
  });

  it("an empty live lists all four", () => {
    const none = {
      totalLeads: null,
      filteredLeads: null,
      directMessages: null,
      serviceBioViews: null,
    };
    expect(missingMetrics(none)).toEqual([...REQUIRED_METRICS]);
    expect(isComplete(none)).toBe(false);
  });

  it("every required metric has a human label", () => {
    for (const m of REQUIRED_METRICS) {
      expect(METRIC_LABEL[m]).toBeTruthy();
    }
  });
});

describe("lookbackWindow", () => {
  it("spans exactly LOOKBACK_DAYS back from now", () => {
    const now = new Date("2026-07-20T02:00:00Z");
    const { since, until } = lookbackWindow(now);
    expect(until).toEqual(now);
    expect((now.getTime() - since.getTime()) / 86_400_000).toBe(LOOKBACK_DAYS);
  });
});
