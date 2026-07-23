import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { appNotifications } from "@/db/schema";
import { cronAuthorized } from "@/lib/auth/cron";
import { alertAdmins } from "@/lib/telegram/alert";
import {
  lookbackWindow,
  leadMetricsIncompleteCondition,
} from "@/lib/tiktok-live/completeness";
import { findOutstanding, notifyStreamers } from "@/lib/tiktok-live/reminders";

/**
 * The 10am Malaysia-time LEADS check. Leads arrive over hours/days as Customer
 * Service works them, so they're chased once each morning — separately from the
 * streamer's own live metrics (DMs/Bio views), which get the ~1h post-live nudge
 * and the 10pm re-check instead.
 *
 * Streamers: one Notification Center row each for lives still missing Total or
 * Filtered Leads, re-surfaced until filled (+ a Telegram DM, once per morning).
 * Admins: the existing summary, UNCHANGED — yesterday only, "no Total Leads".
 *
 * Fail-closed on CRON_SECRET.
 */

const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST
const MAX_LISTED = 10;

/** Yesterday 00:00–24:00 Malaysia time, expressed as UTC instants. */
function yesterdayMyt(now = new Date()) {
  const myt = new Date(now.getTime() + MYT_MS);
  const startMyt = Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate() - 1);
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

  // ONE scan for lives still missing LEAD numbers; both audiences derive from it.
  const outstanding = await findOutstanding(since, until, leadMetricsIncompleteCondition());

  // ── Streamers: reminded in-app + Telegram (idempotent, once-a-day DM gate) ──
  const streamer = await notifyStreamers(outstanding, "leads");

  // ── Admins: UNCHANGED — yesterday only, "no Total Leads" only ──
  const rows = outstanding.filter(
    (r) =>
      r.totalLeads == null &&
      r.startedAt != null &&
      r.startedAt >= start &&
      r.startedAt < end
  );

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      date,
      missing: 0,
      alertsSent: 0,
      outstanding: outstanding.length,
      unassigned: streamer.unassigned,
      streamersNotified: streamer.notified,
      streamersPinged: streamer.pinged,
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
    `${outstanding.length} live(s) in the last 14 days still owe lead numbers; ` +
    `each streamer has been reminded in-app.` +
    `${streamer.unassigned > 0 ? `\n⚠ ${streamer.unassigned} of those have NO assigned streamer — nobody was reminded.` : ""}`;

  // In-app pop-out for admins — deduped to one per day.
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
    unassigned: streamer.unassigned,
    alertsSent,
    streamersNotified: streamer.notified,
    streamersPinged: streamer.pinged,
  });
}
