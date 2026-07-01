import { describe, expect, it } from "vitest";
import { matchKeyword } from "./keyword-match";
import { LiveTally } from "./tally";

describe("matchKeyword", () => {
  it("matches a whole-word keyword, case-insensitive", () => {
    expect(matchKeyword("I want LEND please", ["lend"])).toBe("lend");
    expect(matchKeyword("apply NOW", ["apply"])).toBe("apply");
    expect(matchKeyword("lend!", ["lend"])).toBe("lend");
  });
  it("does NOT match inside another word", () => {
    expect(matchKeyword("blending coffee", ["lend"])).toBeNull();
    expect(matchKeyword("applesauce", ["apply"])).toBeNull();
  });
  it("returns the first matching keyword in order", () => {
    expect(matchKeyword("need a loan today", ["lend", "loan"])).toBe("loan");
  });
  it("handles empty/no-match", () => {
    expect(matchKeyword("", ["lend"])).toBeNull();
    expect(matchKeyword("just chatting", ["lend", "loan"])).toBeNull();
  });
  it("supports the default Malay keyword", () => {
    expect(matchKeyword("nak pinjaman boleh?")).toBe("pinjaman");
  });
});

describe("LiveTally", () => {
  const start = new Date("2026-06-09T13:00:00.000Z");
  const end = new Date("2026-06-09T14:00:00.000Z"); // +1h

  it("aggregates viewers, likes, comments and dedupes keyword leads by user", () => {
    const t = new LiveTally(["lend"], start);
    t.onViewer(100);
    t.onViewer(250);
    t.onViewer(50);
    t.setTotalViews(5689); // cumulative unique viewers (separate from concurrent)
    t.onLike(500);
    t.onLike(1200);
    t.onLike(900); // not higher → ignored
    t.onComment("u1", null, "i want lend", start);
    t.onComment("u1", null, "lend again", start); // same user → still 1 lead
    t.onComment("u2", "Bob", "hello", start); // no keyword → not a lead
    t.onComment("u3", "Sara", "LEND me", start); // 2nd lead
    t.onShare();
    t.onShare();

    expect(t.leadCount).toBe(2);
    expect(t.leadList().map((l) => l.username).sort()).toEqual(["u1", "u3"]);

    const s = t.summary(end);
    expect(s.peakViewers).toBe(250); // max concurrent
    expect(s.totalViews).toBe(5689); // cumulative, set separately
    expect(s.avgViewers).toBe(Math.round((100 + 250 + 50) / 3)); // 133
    expect(s.totalLikes).toBe(1200);
    expect(s.totalComments).toBe(4);
    expect(s.totalShares).toBe(2);
    expect(s.durationSeconds).toBe(3600);
  });

  it("falls back to default keywords when none configured", () => {
    const t = new LiveTally([], start);
    t.onComment("x", null, "boleh apply tak", start);
    expect(t.leadCount).toBe(1);
    expect(t.leadList()[0].keyword).toBe("apply");
  });
});
