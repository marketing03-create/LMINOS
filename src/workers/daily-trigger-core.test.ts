import { describe, expect, it } from "vitest";
import { dailyTriggerDue } from "./daily-trigger-core";

const at = (iso: string) => new Date(iso);
// 11:30 MYT = 03:30 UTC.
const due = (now: string, last: string | null) =>
  dailyTriggerDue(at(now), last ? at(last) : null, "11:30", "14:00");

describe("dailyTriggerDue", () => {
  it("is not due before 11:30 Malaysia time", () => {
    expect(due("2026-11-02T03:29:00Z", null)).toBe(false);
  });

  it("is due from 11:30 when it hasn't run today", () => {
    expect(due("2026-11-02T03:30:00Z", null)).toBe(true);
    expect(due("2026-11-02T03:31:00Z", "2026-11-01T03:30:05Z")).toBe(true);
  });

  it("runs once a day — not again after a restart", () => {
    expect(due("2026-11-02T05:00:00Z", "2026-11-02T03:30:05Z")).toBe(false);
  });

  it("skips the day once the window has passed", () => {
    expect(due("2026-11-02T06:00:00Z", null)).toBe(false);
  });

  it("compares Malaysia days, not UTC days", () => {
    // Last run 1 Nov 11:30 MYT; now 2 Nov 11:30 MYT — a new Malaysia day.
    expect(due("2026-11-02T03:30:00Z", "2026-11-01T03:30:00Z")).toBe(true);
  });
});
