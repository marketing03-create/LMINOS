/**
 * The reminder engine behind all three streamer nudges. One place so the
 * post-live (1h), evening (10pm) and morning (10am) jobs stay consistent about
 * who owes what and how they're told.
 *
 * Three triggers, two metric groups (see completeness.ts):
 *   post-live  ~1h after a live ends  → LIVE metrics (DMs, Bio views), once
 *   10pm       daily re-check          → LIVE metrics, re-nag if still blank
 *   10am       daily                   → LEAD metrics (Total/Filtered Leads)
 *
 * Each group is its own Notification Center row (its own `type`), so filling in
 * DMs clears the live-metrics reminder even while leads are still outstanding.
 */
import { and, eq, gte, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokLiveSessions, userNotifications, users } from "@/db/schema";
import { sendMarkdown, escapeMd } from "@/lib/telegram/send";
import { upsertUserNotification } from "@/lib/notifications/user-inbox";
import {
  METRIC_LABEL,
  MIN_DURATION_SECONDS,
  liveMetricsIncompleteCondition,
  missingLeadMetrics,
  missingLiveMetrics,
  outstandingCondition,
  type RequiredMetric,
} from "./completeness";

const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST
const MAX_LISTED = 10; // keep a Telegram message readable on a heavy day

const timeFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** YYYY-MM-DD in Malaysia time. */
const mytDay = (d: Date) => new Date(d.getTime() + MYT_MS).toISOString().slice(0, 10);

/** The Notification Center track for each metric group. */
export const TRACKS = {
  live: {
    type: "tiktok_missing_metrics",
    dedupeKey: "livemetrics",
    missing: missingLiveMetrics,
    title: (n: number) => `${n} live${n === 1 ? "" : "s"} need your numbers`,
    body: (n: number) =>
      `${n === 1 ? "This live is" : "These lives are"} still missing DMs and Bio views. ` +
      `Tap to add them from your TikTok backend.`,
    ping: (n: number, lines: string) =>
      `📝 ${n} of your live${n === 1 ? "" : "s"} still ${n === 1 ? "needs" : "need"} its numbers ` +
      `(DMs, Bio views):\n${lines}\n\nOpen LMIROS → + → Manual input.`,
  },
  leads: {
    type: "tiktok_missing_leads",
    dedupeKey: "leads",
    missing: missingLeadMetrics,
    title: (n: number) => `${n} live${n === 1 ? "" : "s"} need lead numbers`,
    body: (n: number) =>
      `${n === 1 ? "This live" : "These lives"} still ${n === 1 ? "needs" : "need"} Total Leads ` +
      `and Filtered Leads entered.`,
    ping: (n: number, lines: string) =>
      `📊 Good morning! ${n} of your live${n === 1 ? "" : "s"} still ${n === 1 ? "needs" : "need"} ` +
      `lead numbers:\n${lines}\n\nOpen LMIROS → + → Manual input.`,
  },
} as const;

export type TrackKey = keyof typeof TRACKS;

/** One outstanding-live row, with everything both audiences need. */
export type OutstandingRow = {
  sessionId: string;
  handle: string;
  startedAt: Date | null;
  endedAt: Date | null;
  streamerId: string | null;
  streamerEmail: string | null;
  streamerChatId: string | null;
  totalLeads: number | null;
  filteredLeads: number | null;
  directMessages: number | null;
  serviceBioViews: number | null;
};

const SELECT = {
  sessionId: tiktokLiveSessions.id,
  handle: tiktokAccounts.handle,
  startedAt: tiktokLiveSessions.startedAt,
  endedAt: tiktokLiveSessions.endedAt,
  streamerId: users.id,
  streamerEmail: users.email,
  streamerChatId: users.telegramChatId,
  totalLeads: tiktokLiveSessions.totalLeads,
  filteredLeads: tiktokLiveSessions.filteredLeads,
  directMessages: tiktokLiveSessions.directMessages,
  serviceBioViews: tiktokLiveSessions.serviceBioViews,
};

/** Lives still owing metrics for a group, joined to their assigned streamer. */
export async function findOutstanding(
  since: Date,
  until: Date,
  cond: SQL
): Promise<OutstandingRow[]> {
  return db
    .select(SELECT)
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .leftJoin(users, eq(users.id, tiktokAccounts.assignedStreamerId))
    .where(outstandingCondition(since, until, cond)) as Promise<OutstandingRow[]>;
}

const lineFor = (r: OutstandingRow, track: TrackKey) => {
  const missing = TRACKS[track].missing(r).map((m: RequiredMetric) => METRIC_LABEL[m]);
  return (
    `• @${r.handle}${r.startedAt ? ` · ${timeFmt.format(r.startedAt)}` : ""}` +
    ` — missing ${missing.join(", ")}`
  );
};

/**
 * Notify every streamer with an outstanding live in `rows`, for one track.
 * ONE Notification Center row per streamer (idempotent upsert, re-surfaced),
 * plus a Telegram DM gated to once per Malaysia-day so a re-run can't spam.
 * Returns simple counters for the cron's JSON response.
 */
export async function notifyStreamers(
  rows: OutstandingRow[],
  track: TrackKey
): Promise<{ notified: number; pinged: number; unassigned: number }> {
  const t = TRACKS[track];
  const today = mytDay(new Date());

  const byStreamer = new Map<
    string,
    { chatId: string | null; lines: string[]; sessionIds: string[] }
  >();
  let unassigned = 0;
  for (const r of rows) {
    if (!r.streamerId) {
      unassigned += 1;
      continue;
    }
    const g = byStreamer.get(r.streamerId) ?? {
      chatId: r.streamerChatId,
      lines: [],
      sessionIds: [],
    };
    g.lines.push(lineFor(r, track));
    g.sessionIds.push(r.sessionId);
    byStreamer.set(r.streamerId, g);
  }

  let notified = 0;
  let pinged = 0;
  for (const [streamerId, g] of byStreamer) {
    const n = g.sessionIds.length;

    // Was this streamer's row for this track already refreshed today? That's the
    // once-a-day gate for the Telegram DM — no extra table.
    let sentToday = false;
    try {
      const [prev] = await db
        .select({ updatedAt: userNotifications.updatedAt })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.userId, streamerId),
            eq(userNotifications.type, t.type),
            eq(userNotifications.dedupeKey, t.dedupeKey)
          )
        )
        .limit(1);
      sentToday = !!prev && mytDay(prev.updatedAt) === today;

      await upsertUserNotification({
        userId: streamerId,
        type: t.type,
        dedupeKey: t.dedupeKey,
        title: t.title(n),
        body: t.body(n),
        href: n === 1 ? `/tiktok-live/${g.sessionIds[0]}` : "/tiktok-live",
        sessionIds: g.sessionIds,
      });
      notified += 1;
    } catch {
      // best-effort — one bad row must not stop the others
    }

    if (g.chatId && !sentToday) {
      const listed = g.lines.slice(0, MAX_LISTED).join("\n");
      const more = n > MAX_LISTED ? `\n…and ${n - MAX_LISTED} more` : "";
      try {
        const res = await sendMarkdown(g.chatId, escapeMd(t.ping(n, listed + more)));
        if (res.ok) pinged += 1;
      } catch {
        // best-effort — one bad recipient must not stop the others
      }
    }
  }

  return { notified, pinged, unassigned };
}

/** Nudge streamers about lives ended ≥1h ago that still need LIVE metrics, once each. */
const POST_LIVE_MIN_MS = 60 * 60 * 1000; // wait 1h after a live ends
const POST_LIVE_MAX_MS = 26 * 60 * 60 * 1000; // don't first-nudge ancient lives — 10pm/10am own those

/**
 * The 1-hour post-live nudge. Finds lives that ended between 1h and 26h ago,
 * still missing a streamer live-metric, and never nudged before; marks each so
 * it fires exactly once; then notifies. Safe to call frequently (worker) OR once
 * a day (the 10pm catch-all) — the `metrics_nudged_at` stamp makes it idempotent.
 */
export async function nudgePostLive(now = new Date()): Promise<{
  found: number;
  notified: number;
  pinged: number;
}> {
  const endedFloor = new Date(now.getTime() - POST_LIVE_MAX_MS);
  const endedCeil = new Date(now.getTime() - POST_LIVE_MIN_MS);

  const cond = and(
    isNull(tiktokLiveSessions.metricsNudgedAt),
    isNotNull(tiktokLiveSessions.endedAt),
    gte(tiktokLiveSessions.endedAt, endedFloor),
    lte(tiktokLiveSessions.endedAt, endedCeil),
    gte(tiktokLiveSessions.durationSeconds, MIN_DURATION_SECONDS),
    liveMetricsIncompleteCondition()
  ) as SQL;

  const rows = (await db
    .select(SELECT)
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .leftJoin(users, eq(users.id, tiktokAccounts.assignedStreamerId))
    .where(cond)) as OutstandingRow[];

  if (rows.length === 0) return { found: 0, notified: 0, pinged: 0 };

  // Stamp them BEFORE notifying, so a retry (or the frequent worker) can't
  // double-send. A crash after this leaves them stamped-but-unnotified, which
  // the 10pm catch-all still covers via the daily live-metrics re-nag.
  await db
    .update(tiktokLiveSessions)
    .set({ metricsNudgedAt: now })
    .where(cond);

  const { notified, pinged } = await notifyStreamers(rows, "live");
  return { found: rows.length, notified, pinged };
}
