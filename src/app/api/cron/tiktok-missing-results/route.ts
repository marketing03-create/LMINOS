import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  appNotifications,
  tiktokAccounts,
  tiktokLiveSessions,
  userNotifications,
  users,
} from "@/db/schema";
import { cronAuthorized } from "@/lib/auth/cron";
import { alertAdmins } from "@/lib/telegram/alert";
import { escapeMd, sendMarkdown } from "@/lib/telegram/send";
import { upsertUserNotification } from "@/lib/notifications/user-inbox";
import {
  lookbackWindow,
  METRIC_LABEL,
  missingMetrics,
  outstandingCondition,
} from "@/lib/tiktok-live/completeness";

/**
 * "Did someone forget to fill in their live metrics?" — the 10am Malaysia-time
 * check. The POINT of this job is the STREAMER: it scans the last LOOKBACK_DAYS
 * for any live still missing a required metric (Total Leads, Filtered Leads,
 * DMs, Bio views) and upserts ONE Notification Center row per streamer, resetting
 * it to unread so the bell badge comes back every morning until the numbers are
 * in. That row auto-clears the moment the live is complete (resolved at read
 * time in user-inbox.ts) — no pairing, no setup, works on first login.
 *
 * Admins keep their existing summary UNCHANGED: still yesterday-only, still
 * "no Total Leads", still one Telegram + in-app pop-out per day. Streamers who
 * HAVE paired Telegram also get a personal DM (same once-a-day gate).
 *
 * Fail-closed on CRON_SECRET.
 */

const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST

/** Keep the Telegram message readable on a heavy streaming day. */
const MAX_LISTED = 10;

/** Yesterday 00:00–24:00 Malaysia time, expressed as UTC instants. */
function yesterdayMyt(now = new Date()) {
  const myt = new Date(now.getTime() + MYT_MS);
  const startMyt = Date.UTC(
    myt.getUTCFullYear(),
    myt.getUTCMonth(),
    myt.getUTCDate() - 1
  );
  const start = new Date(startMyt - MYT_MS);
  return {
    start,
    end: new Date(start.getTime() + 86_400_000),
    date: new Date(startMyt).toISOString().slice(0, 10),
  };
}

const timeFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const { start, end, date } = yesterdayMyt();
  const { since, until } = lookbackWindow();

  // ONE scan over the whole lookback window; both audiences are derived from it.
  const outstanding = await db
    .select({
      sessionId: tiktokLiveSessions.id,
      handle: tiktokAccounts.handle,
      startedAt: tiktokLiveSessions.startedAt,
      streamerEmail: users.email,
      streamerId: users.id,
      streamerChatId: users.telegramChatId,
      totalLeads: tiktokLiveSessions.totalLeads,
      filteredLeads: tiktokLiveSessions.filteredLeads,
      directMessages: tiktokLiveSessions.directMessages,
      serviceBioViews: tiktokLiveSessions.serviceBioViews,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .leftJoin(users, eq(users.id, tiktokAccounts.assignedStreamerId))
    .where(outstandingCondition(since, until));

  // ── Streamers: one persistent Notification Center row each, re-surfaced ──
  // NOT gated on firstRunToday — the unique index makes the upsert idempotent,
  // which also makes it self-healing if the admin insert below ever throws.
  const byStreamer = new Map<
    string,
    { chatId: string | null; lines: string[]; sessionIds: string[] }
  >();
  for (const r of outstanding) {
    if (!r.streamerId) continue; // live with no assigned streamer — see admin note
    const g = byStreamer.get(r.streamerId) ?? {
      chatId: r.streamerChatId,
      lines: [],
      sessionIds: [],
    };
    const missing = missingMetrics(r).map((m) => METRIC_LABEL[m]);
    g.lines.push(
      `• @${r.handle}${r.startedAt ? ` · ${timeFmt.format(r.startedAt)}` : ""}` +
        ` — missing ${missing.join(", ")}`
    );
    g.sessionIds.push(r.sessionId);
    byStreamer.set(r.streamerId, g);
  }

  /** YYYY-MM-DD in Malaysia time. */
  const mytDay = (d: Date) =>
    new Date(d.getTime() + MYT_MS).toISOString().slice(0, 10);
  const today = mytDay(new Date());

  let streamersNotified = 0;
  let streamersPinged = 0;
  for (const [streamerId, g] of byStreamer) {
    const n = g.sessionIds.length;

    // Has this streamer's reminder already been refreshed today? That is the
    // once-a-day gate for the Telegram DM — no extra table, no admin-feed noise.
    let alreadySentToday = false;
    try {
      const [prev] = await db
        .select({ updatedAt: userNotifications.updatedAt })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.userId, streamerId),
            eq(userNotifications.type, "tiktok_incomplete_metrics"),
            eq(userNotifications.dedupeKey, "incomplete")
          )
        )
        .limit(1);
      alreadySentToday = !!prev && mytDay(prev.updatedAt) === today;

      await upsertUserNotification({
        userId: streamerId,
        type: "tiktok_incomplete_metrics",
        // Fixed key → ONE row per streamer, refreshed (and re-unread) daily.
        dedupeKey: "incomplete",
        title: `${n} live${n === 1 ? "" : "s"} need your numbers`,
        body:
          `${n === 1 ? "This live is" : "These lives are"} still missing metrics. ` +
          `Tap to fill in Total Leads, Filtered Leads, DMs and Bio views.`,
        href: n === 1 ? `/tiktok-live/${g.sessionIds[0]}` : "/tiktok-live",
        sessionIds: g.sessionIds,
      });
      streamersNotified += 1;
    } catch {
      // best-effort — one bad row must not stop the others
    }

    // Bonus channel: a real phone notification for streamers who paired
    // Telegram. Deliberately INDEPENDENT of the admin path below, so it still
    // fires on a morning when nobody streamed yesterday but older lives are
    // still unfinished.
    if (g.chatId && !alreadySentToday) {
      const msg =
        `📝 Good morning! ${n} of your live${n === 1 ? "" : "s"} ` +
        `still ${n === 1 ? "needs" : "need"} numbers:\n` +
        `${g.lines.slice(0, MAX_LISTED).join("\n")}` +
        `${n > MAX_LISTED ? `\n…and ${n - MAX_LISTED} more` : ""}\n\n` +
        `Open LMIROS → + → Manual input and key them in.`;
      try {
        const res = await sendMarkdown(g.chatId, escapeMd(msg));
        if (res.ok) streamersPinged += 1;
      } catch {
        // best-effort — one bad recipient must not stop the others
      }
    }
  }

  // ── Admins: UNCHANGED — yesterday only, "no Total Leads" only ──
  const rows = outstanding.filter(
    (r) =>
      r.totalLeads == null &&
      r.startedAt != null &&
      r.startedAt >= start &&
      r.startedAt < end
  );
  const unassigned = outstanding.filter((r) => !r.streamerId).length;

  if (rows.length === 0) {
    // Nothing for admins to see, but the streamers above were still reminded.
    return NextResponse.json({
      ok: true,
      date,
      missing: 0,
      alertsSent: 0,
      outstanding: outstanding.length,
      unassigned,
      streamersNotified,
      streamersPinged,
    });
  }

  const lines = rows
    .slice(0, MAX_LISTED)
    .map(
      (r) =>
        `• @${r.handle}${r.startedAt ? ` · ${timeFmt.format(r.startedAt)}` : ""}` +
        `${r.streamerEmail ? ` (${r.streamerEmail})` : ""}`
    );
  const more = rows.length - lines.length;
  const text =
    `📝 Missing live results — ${date}\n` +
    `${rows.length} live${rows.length === 1 ? "" : "s"} still have no Total Leads:\n` +
    `${lines.join("\n")}` +
    `${more > 0 ? `\n…and ${more} more` : ""}\n\n` +
    `${outstanding.length} live(s) in the last 14 days still owe metrics; ` +
    `each streamer has been reminded in-app.` +
    `${unassigned > 0 ? `\n⚠ ${unassigned} of those have NO assigned streamer — nobody was reminded.` : ""}`;

  // In-app pop-out for admins — deduped to one per day. (The streamer DM has
  // its own per-streamer daily gate above, so it no longer depends on this.)
  try {
    await db
      .insert(appNotifications)
      .values({
        type: "tiktok_missing_results",
        title: `${rows.length} live${rows.length === 1 ? "" : "s"} missing results`,
        body: `From ${date} — no Total Leads entered yet.`,
        href: "/admin/tiktok",
        dedupeKey: `missing:${date}`,
      })
      .onConflictDoNothing({
        target: [appNotifications.type, appNotifications.dedupeKey],
      });
  } catch {
    // best-effort — the Telegram summary still goes out
  }

  const alertsSent = await alertAdmins(text);

  return NextResponse.json({
    ok: true,
    date,
    missing: rows.length,
    outstanding: outstanding.length,
    unassigned,
    alertsSent,
    streamersNotified,
    streamersPinged,
  });
}
