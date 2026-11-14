import { describe, expect, it } from "vitest";
import { maxAgeMs, parseSourceStats, pct, rm, statsKey } from "./source-stats-core";

const body = {
  status: 1,
  system: "success",
  data: {
    period: { date_from: "2026-11-01", date_to: "2026-11-30" },
    generated_at: "2026-12-01 09:00:00",
    totals: {
      sales: { count: 12, loan_amount: 61000, new_customer: { count: 9, loan_amount: 45000 }, returning_customer: { count: 3, loan_amount: 16000 }, inherited: { count: 2, loan_amount: 11000 } },
      leads: { received: 40, open: 18, pending_approval: 2, approved: 5, rejected: 3, lost: 12, conversion_rate: 0.125 },
    },
    by_platform: [{ platform: "tiktok", platform_label: "TikTok", sales: { count: 12, loan_amount: 61000 }, leads: null }],
    sources: [
      { source_type: "tiktok", source_type_label: "TikTok page", source_key: "TT0001", source_name: "Page A", platform: "tiktok", sales: { count: 2, loan_amount: 9000 }, leads: null },
      { source_type: "ad_channel", source_type_label: "Ad channel", source_key: "tiktok_live", source_name: "Tiktok Live", platform: "tiktok", sales: { count: 5, loan_amount: 26000 }, leads: { received: 40, approved: 5 } },
      { source_type: "organisation", source_key: "o1", source_name: "Org", platform: "referral", sales: { count: 1, loan_amount: 5000 }, leads: null, partners: [{ partner_name: "Secret" }] },
    ],
  },
};

describe("parseSourceStats", () => {
  const s = parseSourceStats(body);
  it("reads totals, sales split and leads", () => {
    expect(s.totals.sales).toMatchObject({ count: 12, amount: 61000, newCustomer: { count: 9, amount: 45000 } });
    expect(s.totals.leads).toMatchObject({ received: 40, open: 18, pending: 2, conversion: 0.125 });
  });
  it("sorts sources by loan amount, biggest first", () => {
    expect(s.sources.map((x) => x.key)).toEqual(["tiktok_live", "TT0001", "o1"]);
  });
  it("works out conversion when the API leaves it out, and keeps no-lead sources null", () => {
    expect(s.sources.at(0)?.leads?.conversion).toBe(0.125);
    expect(s.sources.at(1)?.leads).toBeNull();
  });
  it("never carries referral partners' names", () => {
    expect(JSON.stringify(s)).not.toContain("Secret");
  });
  it("throws on an error answer", () => {
    expect(() => parseSourceStats({ status: 0, system: "external.token.expired" })).toThrow();
  });
});

describe("helpers", () => {
  it("keys requests by dates and sorted platforms", () => {
    expect(statsKey("2026-11-01", "2026-11-30", ["tiktok", "google"])).toBe("2026-11-01|2026-11-30|google,tiktok");
    expect(statsKey("2026-11-01", "2026-11-30", [])).toBe("2026-11-01|2026-11-30|all");
  });
  it("refreshes a range reaching today more often than a closed one", () => {
    expect(maxAgeMs("2026-11-14", "2026-11-14")).toBeLessThan(maxAgeMs("2026-10-31", "2026-11-14"));
  });
  it("formats money and rates", () => {
    expect(rm(61000)).toBe("RM 61,000");
    expect(pct(0.125)).toBe("12.5%");
    expect(pct(0.4444)).toBe("44.4%");
    expect(pct(0.5)).toBe("50%");
    expect(pct(null)).toBe("—");
  });
});
