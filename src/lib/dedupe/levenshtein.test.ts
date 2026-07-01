import { describe, expect, it } from "vitest";
import { levenshtein, normalizeName } from "./levenshtein";

describe("levenshtein", () => {
  it.each([
    ["", "", 0],
    ["a", "", 1],
    ["", "a", 1],
    ["kitten", "sitting", 3],
    ["ahmad", "ahmed", 1],
    ["siti binti", "siti binti", 0],
    ["lim wei chen", "lim wei chien", 1],
  ])("d(%s, %s) = %i", (a, b, exp) => {
    expect(levenshtein(a, b)).toBe(exp);
  });
});

describe("normalizeName", () => {
  it("trims, lowercases, collapses whitespace", () => {
    expect(normalizeName("  Ahmad   Bin  Ali ")).toBe("ahmad bin ali");
  });
});
