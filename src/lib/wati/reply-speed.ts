/**
 * CS reply speed over a period — the numbers behind the Dashboard's "CS
 * replies" pane. Pure, so the arithmetic is pinned in tests.
 *
 * A reply time is first-message-we-saw → first human reply (see sync.ts /
 * history.ts). Only leads WATI reply tracking could have seen count: their
 * account must be tracking, and the lead no older than the sync's 48h look-back
 * at the moment tracking began — earlier leads were never checked, so their
 * missing reply means "unknown", not "ignored".
 *
 * Median leads, average sits beside it: a handful of chats answered the next
 * morning drag the average far from what a typical customer waited.
 */

export const SYNC_LOOKBACK_MS = 48 * 3_600_000;
const MYT_MS = 8 * 3_600_000;

export type ReplyRow = {
  connectionId: string;
  firstMessageAt: Date;
  firstReplyAt: Date | null;
};

export type ReplyConnection = { id: string; name: string; repliesSeenAt: Date | null };

export type ReplySummary = {
  leads: number;
  replied: number;
  noReply: number;
  medianMin: number | null;
  averageMin: number | null;
  /** Share of replied leads answered within 5 / 15 minutes, 0–100. */
  within5Pct: number | null;
  within15Pct: number | null;
};

export type ReplySpeed = ReplySummary & {
  byDay: (ReplySummary & { day: string })[];
  byConnection: (ReplySummary & { id: string; name: string })[];
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarizeReplies(rows: ReplyRow[]): ReplySummary {
  const delays = rows
    .filter((r) => r.firstReplyAt && r.firstReplyAt >= r.firstMessageAt)
    .map((r) => (r.firstReplyAt!.getTime() - r.firstMessageAt.getTime()) / 60_000)
    .sort((a, b) => a - b);
  const n = delays.length;
  const pct = (limit: number) =>
    n === 0 ? null : Math.round((delays.filter((d) => d <= limit).length / n) * 100);
  const med = median(delays);
  return {
    leads: rows.length,
    replied: n,
    noReply: rows.length - n,
    medianMin: med === null ? null : round1(med),
    averageMin: n === 0 ? null : round1(delays.reduce((a, d) => a + d, 0) / n),
    within5Pct: pct(5),
    within15Pct: pct(15),
  };
}

/** Malaysia calendar day, YYYY-MM-DD. */
export function mytDay(d: Date): string {
  return new Date(d.getTime() + MYT_MS).toISOString().slice(0, 10);
}

/** Leads reply tracking could have seen (see the file note). */
export function trackedRows(rows: ReplyRow[], connections: ReplyConnection[]): ReplyRow[] {
  const since = new Map(
    connections
      .filter((c) => c.repliesSeenAt)
      .map((c) => [c.id, c.repliesSeenAt!.getTime() - SYNC_LOOKBACK_MS])
  );
  return rows.filter((r) => {
    const from = since.get(r.connectionId);
    return from !== undefined && r.firstMessageAt.getTime() >= from;
  });
}

export function replySpeed(rows: ReplyRow[], connections: ReplyConnection[]): ReplySpeed {
  const tracked = trackedRows(rows, connections);

  const days = new Map<string, ReplyRow[]>();
  for (const r of tracked) {
    const k = mytDay(r.firstMessageAt);
    days.set(k, [...(days.get(k) ?? []), r]);
  }
  const byDay = [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, list]) => ({ day, ...summarizeReplies(list) }));

  const byConnection = connections
    .filter((c) => c.repliesSeenAt)
    .map((c) => ({
      id: c.id,
      name: c.name,
      ...summarizeReplies(tracked.filter((r) => r.connectionId === c.id)),
    }))
    .filter((c) => c.leads > 0);

  return { ...summarizeReplies(tracked), byDay, byConnection };
}
