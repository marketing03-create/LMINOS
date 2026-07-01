import { describe, expect, it } from "vitest";
import { isRejectedLikeStatus, shouldAdvance } from "./funnel";

describe("shouldAdvance", () => {
  it("moves forward on the funnel", () => {
    expect(shouldAdvance("new", "contacted")).toBe(true);
    expect(shouldAdvance("contacted", "pending")).toBe(true);
    expect(shouldAdvance("pending", "approved")).toBe(true);
  });
  it("does not move backward", () => {
    expect(shouldAdvance("approved", "pending")).toBe(false);
    expect(shouldAdvance("contacted", "new")).toBe(false);
  });
  it("does not change to same status", () => {
    expect(shouldAdvance("new", "new")).toBe(false);
  });
  it("allows terminal → terminal upgrades (unreachable → rejected)", () => {
    expect(shouldAdvance("unreachable", "rejected")).toBe(true);
    expect(shouldAdvance("not_suitable", "approved")).toBe(true);
  });
  it("does not regress between terminals", () => {
    expect(shouldAdvance("approved", "rejected")).toBe(false);
    expect(shouldAdvance("rejected", "unreachable")).toBe(false);
  });
});

describe("isRejectedLikeStatus", () => {
  it.each([
    ["rejected", true],
    ["not_suitable", true],
    ["approved", false],
    ["new", false],
  ] as const)("%s → %s", (s, exp) => {
    expect(isRejectedLikeStatus(s as never)).toBe(exp);
  });
});
