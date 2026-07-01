import { describe, expect, it } from "vitest";
import { parseSalesRow, resolveHeaderMap } from "./parse";

describe("resolveHeaderMap", () => {
  it("maps default aliases", () => {
    const headers = ["Phone Number", "Email", "Agent", "Status", "Amount"];
    const m = resolveHeaderMap(headers);
    expect(m.get("phone_number")).toBe(0);
    expect(m.get("email")).toBe(1);
    expect(m.get("agent_name")).toBe(2);
    expect(m.get("sales_status")).toBe(3);
    expect(m.get("sales_amount")).toBe(4);
  });

  it("respects per-tab columnMapping overrides", () => {
    const headers = ["Mobile", "Email", "Officer", "Stage"];
    const m = resolveHeaderMap(headers, {
      phone_number: "Mobile",
      agent_name: "Officer",
      sales_status: "Stage",
    });
    expect(m.get("phone_number")).toBe(0);
    expect(m.get("agent_name")).toBe(2);
    expect(m.get("sales_status")).toBe(3);
  });

  it("ignores headers it doesn't recognize", () => {
    const headers = ["Phone Number", "Random Column"];
    const m = resolveHeaderMap(headers);
    expect(m.get("phone_number")).toBe(0);
    expect(m.size).toBe(1);
  });
});

describe("parseSalesRow", () => {
  const headers = [
    "Phone Number",
    "Email",
    "Agent",
    "Loan Type",
    "Status",
    "Amount",
    "Revenue",
    "Closed Date",
    "Reason",
    "Notes",
  ];
  const map = resolveHeaderMap(headers);

  it("parses an approved row", () => {
    const row = [
      "012-345-6789",
      "Ahmad@Example.com",
      "Lim Wei Chen",
      "Personal",
      "Approved",
      "RM 25,000",
      "1500.00",
      "2026-05-20",
      "",
      "All docs in",
    ];
    const r = parseSalesRow(row, 2, map, headers);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.normalizedPhone).toBe("60123456789");
      expect(r.data.normalizedEmail).toBe("ahmad@example.com");
      expect(r.data.agentNameRaw).toBe("Lim Wei Chen");
      expect(r.data.salesStatus).toBe("approved");
      expect(r.data.salesAmount).toBe("25000.00");
      expect(r.data.revenueValue).toBe("1500.00");
      expect(r.data.closedDate).toBe("2026-05-20");
    }
  });

  it("rejects rows missing phone", () => {
    const r = parseSalesRow(["", "x@y.com"], 2, map, headers);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing phone/);
  });

  it("rejects rows with bad phone", () => {
    const r = parseSalesRow(["not-a-phone"], 2, map, headers);
    expect(r.ok).toBe(false);
  });

  it("normalizes status synonyms", () => {
    const r = parseSalesRow(
      ["+60123456788", "", "", "", "Unreachable"],
      2,
      map,
      headers
    );
    if (r.ok) expect(r.data.salesStatus).toBe("unreachable");

    const r2 = parseSalesRow(
      ["+60123456788", "", "", "", "Not Suitable"],
      3,
      map,
      headers
    );
    if (r2.ok) expect(r2.data.salesStatus).toBe("not_suitable");
  });
});
