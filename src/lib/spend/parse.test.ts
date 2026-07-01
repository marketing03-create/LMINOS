import { describe, expect, it } from "vitest";
import { parseSpendCsv } from "./parse";

describe("parseSpendCsv", () => {
  it("parses a Meta-style spend CSV", () => {
    const csv = [
      "Platform,Account ID,Campaign ID,Campaign name,Date,Amount spent,Impressions,Link clicks",
      "meta,act_123,c_111,May Personal Loan,2026-05-26,1500.75,12500,210",
      "meta,act_123,c_222,May SME,2026-05-26,820.00,8000,90",
    ].join("\n");
    const { results, okCount, errorCount } = parseSpendCsv(csv);
    expect(okCount).toBe(2);
    expect(errorCount).toBe(0);
    const first = results[0];
    if (first.ok) {
      expect(first.data.platform).toBe("meta");
      expect(first.data.ad_account_external_id).toBe("act_123");
      expect(first.data.campaign_external_id).toBe("c_111");
      expect(first.data.spend).toBe(1500.75);
      expect(first.data.impressions).toBe(12500);
      expect(first.data.clicks).toBe(210);
      expect(first.data.date).toBe("2026-05-26");
    }
  });

  it("normalizes M/D/YYYY dates to ISO", () => {
    const csv = [
      "platform,ad_account_id,campaign_id,date,spend",
      "google,7234567890,c_999,5/20/2026,100",
    ].join("\n");
    const { results } = parseSpendCsv(csv);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) expect(results[0].data.date).toBe("2026-05-20");
  });

  it("rejects unknown platforms", () => {
    const csv = [
      "platform,ad_account_id,campaign_id,date,spend",
      "linkedin,acct,c1,2026-05-26,100",
    ].join("\n");
    const { results, okCount, errorCount } = parseSpendCsv(csv);
    expect(okCount).toBe(0);
    expect(errorCount).toBe(1);
    if (!results[0].ok) expect(results[0].error).toMatch(/platform/);
  });

  it("rejects rows missing required columns", () => {
    const csv = [
      "platform,ad_account_id,date,spend",
      "tiktok,acct,2026-05-26,100",
    ].join("\n");
    const { errorCount, results } = parseSpendCsv(csv);
    expect(errorCount).toBe(1);
    if (!results[0].ok) expect(results[0].error).toMatch(/campaign_external_id/);
  });
});
