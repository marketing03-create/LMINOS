import { describe, expect, it } from "vitest";
import { parseLeadsCsv } from "./csv";

describe("parseLeadsCsv", () => {
  it("parses a valid CSV with header aliases", () => {
    const csv = [
      "Brand,Loan Type,Full Name,Phone Number,Email,City",
      "default,Personal,Ahmad,012-345-6789,a@b.com,Kuala Lumpur",
      "default,Sme,Lim Wei Chen,+60123456788,lim@b.com,Petaling Jaya",
    ].join("\n");

    const { results, okCount, errorCount } = parseLeadsCsv(csv);
    expect(okCount).toBe(2);
    expect(errorCount).toBe(0);
    const first = results[0];
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.lead.brand_slug).toBe("default");
      expect(first.lead.full_name).toBe("Ahmad");
      expect(first.lead.phone).toBe("012-345-6789");
      expect(first.lead.location).toBe("Kuala Lumpur");
    }
  });

  it("reports per-row errors with row numbers", () => {
    const csv = [
      "brand_slug,loan_type,phone",
      "default,personal,+60123456789",
      ",personal,+60123456788", // missing brand_slug
      "default,,+60123456787", // missing loan_type
    ].join("\n");

    const { results, okCount, errorCount } = parseLeadsCsv(csv);
    expect(okCount).toBe(1);
    expect(errorCount).toBe(2);
    const bad = results.filter((r) => !r.ok);
    expect(bad.map((r) => r.row)).toEqual([3, 4]);
  });

  it("ignores empty lines", () => {
    const csv = [
      "brand_slug,loan_type,phone",
      "default,personal,+60123456789",
      "",
      "default,sme,+60123456788",
      "",
    ].join("\n");
    const { okCount, errorCount } = parseLeadsCsv(csv);
    expect(okCount).toBe(2);
    expect(errorCount).toBe(0);
  });
});
