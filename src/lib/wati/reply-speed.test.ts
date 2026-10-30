import { describe, expect, it } from "vitest";
import { mytDay, replySpeed, summarizeReplies, trackedRows, type ReplyRow } from "./reply-speed";

const at = (iso: string) => new Date(iso);
const row = (conn: string, first: string, replyAfterMin: number | null): ReplyRow => ({
  connectionId: conn,
  firstMessageAt: at(first),
  firstReplyAt: replyAfterMin === null ? null : new Date(at(first).getTime() + replyAfterMin * 60_000),
});

describe("summarizeReplies", () => {
  it("median, average and within-x shares", () => {
    const s = summarizeReplies([
      row("a", "2026-10-30T04:00:00Z", 2),
      row("a", "2026-10-30T04:10:00Z", 4),
      row("a", "2026-10-30T04:20:00Z", 10),
      row("a", "2026-10-30T04:30:00Z", 600), // answered the next morning
      row("a", "2026-10-30T04:40:00Z", null),
    ]);
    expect(s).toEqual({
      leads: 5,
      replied: 4,
      noReply: 1,
      medianMin: 7,
      averageMin: 154,
      within5Pct: 50,
      within15Pct: 75,
    });
  });

  it("nothing replied → nulls, not zeros", () => {
    expect(summarizeReplies([row("a", "2026-10-30T04:00:00Z", null)])).toMatchObject({
      replied: 0,
      medianMin: null,
      averageMin: null,
      within5Pct: null,
    });
    expect(summarizeReplies([]).leads).toBe(0);
  });

  it("ignores a reply stamped before the message", () => {
    expect(summarizeReplies([row("a", "2026-10-30T04:00:00Z", -3)]).replied).toBe(0);
  });
});

describe("trackedRows", () => {
  const conns = [
    { id: "a", name: "Ainn", repliesSeenAt: at("2026-10-30T09:00:00Z") },
    { id: "b", name: "Abangduit", repliesSeenAt: null },
  ];
  it("keeps leads inside the 48h look-back of a tracking account only", () => {
    const rows = [
      row("a", "2026-10-29T10:00:00Z", 5), // 23h before tracking began → checked
      row("a", "2026-10-27T10:00:00Z", 5), // 71h before → never checked
      row("b", "2026-10-30T10:00:00Z", null), // account not tracking
    ];
    expect(trackedRows(rows, conns)).toEqual([rows[0]]);
  });
});

describe("replySpeed", () => {
  it("splits by Malaysia day (newest first) and by account", () => {
    const conns = [
      { id: "a", name: "Ainn", repliesSeenAt: at("2026-10-30T00:00:00Z") },
      { id: "b", name: "Abangduit", repliesSeenAt: at("2026-10-30T00:00:00Z") },
    ];
    const r = replySpeed(
      [
        row("a", "2026-10-29T15:30:00Z", 4), // 23:30 MYT, 29 Oct
        row("a", "2026-10-29T16:30:00Z", 6), // 00:30 MYT, 30 Oct
        row("b", "2026-10-30T02:00:00Z", 20),
      ],
      conns
    );
    expect(r.byDay.map((d) => [d.day, d.replied])).toEqual([
      ["2026-10-30", 2],
      ["2026-10-29", 1],
    ]);
    expect(r.byConnection.map((c) => [c.name, c.medianMin])).toEqual([
      ["Ainn", 5],
      ["Abangduit", 20],
    ]);
    expect(r.medianMin).toBe(6);
  });

  it("mytDay is the Malaysia calendar day", () => {
    expect(mytDay(at("2026-10-29T16:30:00Z"))).toBe("2026-10-30");
  });
});
