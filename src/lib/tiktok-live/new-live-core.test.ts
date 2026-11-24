import { describe, expect, it } from "vitest";
import { newLiveDefaults, newLiveProblem } from "./new-live-core";

const accounts = [
  { id: "a1", handle: "abangduit.my" },
  { id: "a2", handle: "adminain111" },
];

describe("newLiveDefaults", () => {
  it("fills handle, date and start time from the screenshot", () => {
    expect(newLiveDefaults({ handle: "@AdminAin111", date: "2026-11-24", startTime: "21:05" }, accounts)).toEqual({
      accountId: "a2",
      date: "2026-11-24",
      startTime: "21:05",
    });
  });
  it("uses the person's only handle when the screenshot names none", () => {
    expect(newLiveDefaults({ handle: null, date: "2026-11-24", startTime: null }, [accounts[0]]).accountId).toBe("a1");
  });
  it("leaves unknown fields blank instead of guessing", () => {
    expect(newLiveDefaults({ handle: "someone.else", date: null, startTime: "9pm" }, accounts)).toEqual({
      accountId: "",
      date: "",
      startTime: "",
    });
  });
});

describe("newLiveProblem", () => {
  it("names what is still missing", () => {
    expect(newLiveProblem({ accountId: "", date: "2026-11-24", startTime: "21:00" })).toMatch(/handle/);
    expect(newLiveProblem({ accountId: "a1", date: "", startTime: "21:00" })).toMatch(/date/);
    expect(newLiveProblem({ accountId: "a1", date: "2026-11-24", startTime: "" })).toMatch(/start time/);
    expect(newLiveProblem({ accountId: "a1", date: "2026-11-24", startTime: "21:00" })).toBeNull();
  });
});
