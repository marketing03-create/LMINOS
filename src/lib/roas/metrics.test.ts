import { describe, expect, it } from "vitest";
import { fmtMyr, fmtPct, fmtRoas, metrics } from "./metrics";

describe("metrics()", () => {
  it("returns null for ratios when denominators are zero", () => {
    const m = metrics({
      leads: 0,
      approved: 0,
      closed: 0,
      rejected: 0,
      outcomes: 0,
      spend: 0,
      revenue: 0,
    });
    expect(m.cpl).toBeNull();
    expect(m.cpa).toBeNull();
    expect(m.realRoas).toBeNull();
    expect(m.approvalRate).toBe(0);
    expect(m.closeRate).toBe(0);
  });

  it("computes the canonical scenario from the plan", () => {
    // From plan §Verification: 50 leads / 10 approvals / RM 50,000 revenue
    // Suppose spend = RM 10,000.
    const m = metrics({
      leads: 50,
      approved: 10,
      closed: 0,
      rejected: 30,
      outcomes: 40,
      spend: 10_000,
      revenue: 50_000,
    });
    expect(m.cpl).toBe(200); // 10000 / 50
    expect(m.cpa).toBe(1000); // 10000 / 10
    expect(m.approvalRate).toBeCloseTo(0.25); // 10 / 40
    expect(m.realRoas).toBe(5); // 50000 / 10000
  });

  it("rounds to sensible precision", () => {
    const m = metrics({
      leads: 7,
      approved: 1,
      closed: 0,
      rejected: 2,
      outcomes: 3,
      spend: 100,
      revenue: 333,
    });
    expect(m.cpl).toBe(14.29);
    expect(m.realRoas).toBe(3.33);
    expect(m.approvalRate).toBeCloseTo(1 / 3, 4);
  });

  it("defaults ad stats to 0 and their ratios to null when absent", () => {
    const m = metrics({
      leads: 5,
      approved: 1,
      closed: 0,
      rejected: 0,
      outcomes: 1,
      spend: 100,
      revenue: 200,
    });
    expect(m.impressions).toBe(0);
    expect(m.clicks).toBe(0);
    expect(m.platformConversions).toBe(0);
    expect(m.ctr).toBeNull();
    expect(m.avgCpc).toBeNull();
    expect(m.leadQuality).toBeNull();
  });

  it("computes CTR, avg CPC and lead-quality from ad stats", () => {
    // Mirrors the screenshot window: 55,842 impr / 3,041 clicks / RM 8,975.50
    // / 245 platform conversions, with 30 real approved loans.
    const m = metrics({
      leads: 1000,
      approved: 30,
      closed: 0,
      rejected: 0,
      outcomes: 100,
      spend: 8975.5,
      revenue: 150_000,
      impressions: 55_842,
      clicks: 3041,
      platformConversions: 245,
    });
    expect(m.ctr).toBeCloseTo(3041 / 55_842, 4); // ~5.45%
    expect(m.avgCpc).toBe(2.95); // 8975.50 / 3041, rounded to 2dp
    expect(m.leadQuality).toBeCloseTo(30 / 245, 4); // ~12.2% real vs platform
  });
});

describe("formatters", () => {
  it("fmtMyr", () => {
    expect(fmtMyr(1234567)).toBe("RM 1,234,567");
    expect(fmtMyr(null)).toBe("—");
  });
  it("fmtPct", () => {
    expect(fmtPct(0.123)).toBe("12%");
  });
  it("fmtRoas", () => {
    expect(fmtRoas(3.456)).toBe("3.46×");
    expect(fmtRoas(null)).toBe("—");
  });
});
