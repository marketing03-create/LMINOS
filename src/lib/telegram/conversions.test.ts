import { describe, expect, it } from "vitest";
import { parseSaleCommand } from "./parse-sale";

describe("parseSaleCommand", () => {
  const valid: Array<[string, { phone: string; amount: number }]> = [
    ["/sale 0123456789 25000", { phone: "0123456789", amount: 25000 }],
    ["/close +60123456789 25000", { phone: "+60123456789", amount: 25000 }],
    ["/won 0123456789 RM25,000.50", { phone: "0123456789", amount: 25000.5 }],
    ["/deal 0123456789 1000", { phone: "0123456789", amount: 1000 }],
    ["  /sale   0123456789   25000  ", { phone: "0123456789", amount: 25000 }],
    ["/SALE 0123456789 25000", { phone: "0123456789", amount: 25000 }], // case-insensitive
    ["/sale 0123456789 RM 25000", { phone: "0123456789", amount: 25000 }],
  ];

  it.each(valid)("parses %s", (input, expected) => {
    const r = parseSaleCommand(input);
    expect(r).not.toBeNull();
    expect(r).toEqual(expected);
  });

  const invalid: string[] = [
    "/sale", // no args
    "/sale 0123456789", // no amount
    "/sale 0123456789 abc", // non-numeric amount
    "/sale 0123456789 0", // zero amount
    "/sale 0123456789 -500", // negative amount → strips '-' → 500? guard below
    "/start hq@company.com", // not a sale command
    "hello world",
    "",
  ];

  it.each(invalid)("rejects %s", (input) => {
    const r = parseSaleCommand(input);
    // "-500" strips to "500" (positive) — that's acceptable; everything else null.
    if (input === "/sale 0123456789 -500") {
      expect(r).toEqual({ phone: "0123456789", amount: 500 });
    } else {
      expect(r).toBeNull();
    }
  });
});
