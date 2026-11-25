import { describe, expect, it } from "vitest";
import { liveDateNote, newLiveDefaults, newLiveProblem, shortDate } from "./new-live-core";

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


describe("liveDateNote", () => {
  it("flags a live older than a week, with how long ago", () => {
    expect(liveDateNote("2026-06-25", "2026-11-25")).toBe("25 Jun · 5 months ago");
    expect(liveDateNote("2026-11-10", "2026-11-25")).toBe("10 Nov · 15 days ago");
  });
  it("flags a date in the future", () => {
    expect(liveDateNote("2026-11-26", "2026-11-25")).toBe("26 Nov · in the future");
  });
  it("stays quiet for this week's lives or a missing date", () => {
    expect(liveDateNote("2026-11-24", "2026-11-25")).toBeNull();
    expect(liveDateNote("", "2026-11-25")).toBeNull();
  });
  it("formats short dates", () => {
    expect(shortDate("2026-06-05")).toBe("5 Jun");
  });
});
