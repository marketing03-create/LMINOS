import { describe, expect, it } from "vitest";
import {
  isComplete,
  LEAD_METRICS,
  LIVE_METRICS,
  LOOKBACK_DAYS,
  lookbackWindow,
  METRIC_LABEL,
  missingLeadMetrics,
  missingLiveMetrics,
  missingMetrics,
  previousDaysWindow,
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

describe("the lead / live-metric split", () => {
  it("the two groups partition the required set, no overlap", () => {
    expect([...LEAD_METRICS, ...LIVE_METRICS].sort()).toEqual(
      [...REQUIRED_METRICS].sort()
    );
    expect(LEAD_METRICS.some((m) => (LIVE_METRICS as readonly string[]).includes(m))).toBe(false);
  });

  it("live-metric gaps are chased independently of leads", () => {
    // Leads both in, but a live metric blank → the LIVE reminder should fire and
    // the LEAD reminder should not. This is what lets DMs clear without leads.
    const row = { totalLeads: 4, filteredLeads: 2, directMessages: null, serviceBioViews: 8 };
    expect(missingLiveMetrics(row)).toEqual(["directMessages"]);
    expect(missingLeadMetrics(row)).toEqual([]);
  });

  it("lead gaps are chased independently of live metrics", () => {
    const row = { totalLeads: null, filteredLeads: 2, directMessages: 30, serviceBioViews: 8 };
    expect(missingLeadMetrics(row)).toEqual(["totalLeads"]);
    expect(missingLiveMetrics(row)).toEqual([]);
  });

  it("a live with only its live metrics done is NOT lead-complete", () => {
    const row = { totalLeads: null, filteredLeads: null, directMessages: 1, serviceBioViews: 1 };
    expect(missingLiveMetrics(row)).toEqual([]);
    expect(missingLeadMetrics(row)).toEqual([...LEAD_METRICS]);
    expect(isComplete(row)).toBe(false);
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

describe("previousDaysWindow", () => {
  it("covers the 7 whole Malaysia days before today, not today", () => {
    // 2 Nov 11:30 MYT = 03:30 UTC → 26 Oct 00:00 MYT … 2 Nov 00:00 MYT.
    const { since, until } = previousDaysWindow(7, new Date("2026-11-02T03:30:00Z"));
    expect(since.toISOString()).toBe("2026-10-25T16:00:00.000Z");
    expect(until.toISOString()).toBe("2026-11-01T16:00:00.000Z");
  });

  it("uses the Malaysia day even when UTC is still on the day before", () => {
    // 2 Nov 01:00 MYT = 1 Nov 17:00 UTC — today is still 2 Nov in Malaysia.
    const { until } = previousDaysWindow(7, new Date("2026-11-01T17:00:00Z"));
    expect(until.toISOString()).toBe("2026-11-01T16:00:00.000Z");
  });
});
