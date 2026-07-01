import { describe, expect, it } from "vitest";
import { normalizePhoneMY } from "./phone";

describe("normalizePhoneMY", () => {
  const valid: Array<[string, string]> = [
    ["0123456789", "60123456789"],
    ["+60123456789", "60123456789"],
    ["60123456789", "60123456789"],
    ["012-345-6789", "60123456789"],
    ["012 345 6789", "60123456789"],
    ["+60 12-345 6789", "60123456789"],
    ["011-12345678", "601112345678"], // 11-digit Malaysian mobile
    ["+6011-12345678", "601112345678"],
  ];

  it.each(valid)("normalizes %s → %s", (input, expected) => {
    const r = normalizePhoneMY(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe(expected);
  });

  const invalid: string[] = [
    "",
    "   ",
    "abc",
    "123",
    "+1 555 555 5555", // US number
    "0000000000",
  ];

  it.each(invalid)("rejects %s", (input) => {
    const r = normalizePhoneMY(input);
    expect(r.ok).toBe(false);
  });

  it("handles null/undefined/non-string", () => {
    expect(normalizePhoneMY(null).ok).toBe(false);
    expect(normalizePhoneMY(undefined).ok).toBe(false);
    expect(normalizePhoneMY(12345).ok).toBe(false);
  });
});
