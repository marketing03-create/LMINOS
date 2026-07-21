import { describe, expect, it } from "vitest";
import { matchSessions, mytDateStr, type MatchSession } from "./match-session-core";

const sessions: MatchSession[] = [
  // 2026-06-10 04:55 UTC = 12:55 MYT (the @adminain1 live)
  { sessionId: "s1", accountId: "a1", handle: "adminain1", startedAt: new Date("2026-06-10T04:55:33.000Z"), title: "Live" },
  // 2026-06-10 13:00 UTC = 21:00 MYT (a later live, different handle)
  { sessionId: "s2", accountId: "a2", handle: "otherbrand", startedAt: new Date("2026-06-10T13:00:00.000Z"), title: "Other" },
  // 2026-06-08 02:00 UTC = 10:00 MYT (a different day)
  { sessionId: "s3", accountId: "a1", handle: "adminain1", startedAt: new Date("2026-06-08T02:00:00.000Z"), title: "Older" },
];

describe("mytDateStr", () => {
  it("converts a UTC instant to its Malaysia calendar date", () => {
    expect(mytDateStr(new Date("2026-06-10T04:55:33.000Z"))).toBe("2026-06-10");
    // 2026-06-09 20:30 UTC = 2026-06-10 04:30 MYT (rolls to next day)
    expect(mytDateStr(new Date("2026-06-09T20:30:00.000Z"))).toBe("2026-06-10");
  });
});

describe("matchSessions", () => {
  it("matches a dated group to the same-day session, preferring handle then closest time", () => {
    const [r] = matchSessions({
      groups: [{ key: "g", date: "2026-06-10", handle: "adminain1", startTime: "12:55" }],
      sessions,
    });
    expect(r.bestMatchSessionId).toBe("s1");
    expect(r.candidateIds).toEqual(["s1", "s2"]); // both 2026-06-10, s1 (handle match) first
  });

  it("falls back to closest start time when handle is unknown", () => {
    const [r] = matchSessions({
      groups: [{ key: "g", date: "2026-06-10", handle: null, startTime: "20:30" }],
      sessions,
    });
    expect(r.bestMatchSessionId).toBe("s2"); // 21:00 MYT is closest to 20:30
  });

  it("matches on month+day when the AI mis-inferred the YEAR (2024 vs 2026)", () => {
    // TikTok analytics shows "10 Jun" with no year, so the AI can read it as
    // 2024 while the live was actually 2026 — must still auto-match on 06-10.
    const [r] = matchSessions({
      groups: [{ key: "g", date: "2024-06-10", handle: "adminain1", startTime: "12:55" }],
      sessions,
    });
    expect(r.bestMatchSessionId).toBe("s1");
  });

  it("returns no match when no session exists on that date", () => {
    const [r] = matchSessions({
      groups: [{ key: "g", date: "2026-01-01", handle: "adminain1", startTime: "10:00" }],
      sessions,
    });
    expect(r.bestMatchSessionId).toBeNull();
    expect(r.candidateIds).toEqual([]);
  });

  it("offers all sessions for an undated group (manual attach)", () => {
    const [r] = matchSessions({
      groups: [{ key: "undated-0", date: null, handle: null, startTime: null }],
      sessions,
    });
    expect(r.bestMatchSessionId).toBeNull();
    expect(r.candidateIds).toEqual(["s1", "s2", "s3"]);
  });
});
