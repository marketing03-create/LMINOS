import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import {
  incompleteCondition,
  previousDaysWindow,
} from "@/lib/tiktok-live/completeness";
import { findOutstanding, notifyStreamers } from "@/lib/tiktok-live/reminders";

/**
 * The 11:30am Malaysia-time weekly check: every streamer with a live from the
 * previous 7 days that still has a blank DMs / Bio views / Total PM / Document
 * Collect gets an URGENT phone notification (rings, stays until dismissed) plus
 * a Notification Center row that clears itself once the numbers are in.
 *
 * Triggered by the Fly.io worker at 11:30 sharp — Vercel Hobby crons only fire
 * "somewhere in the hour". Accepts CRON_SECRET or the worker's own
 * REMINDER_TRIGGER_SECRET. Safe to call twice: the phone notification goes out
 * at most once per streamer per Malaysia-day. `?dry=1` counts without sending.
 */
const DAYS = 7;

function authorized(request: NextRequest): boolean {
  if (cronAuthorized(request)) return true;
  // trim: a value piped into `vercel env add` can carry a trailing newline.
  const expected = process.env.REMINDER_TRIGGER_SECRET?.trim();
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const { since, until } = previousDaysWindow(DAYS);
  const outstanding = await findOutstanding(since, until, incompleteCondition());
  const streamers = new Set(outstanding.map((r) => r.streamerId).filter(Boolean));

  if (request.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({
      ok: true,
      dry: true,
      since: since.toISOString(),
      until: until.toISOString(),
      outstanding: outstanding.length,
      streamers: streamers.size,
    });
  }

  const result = await notifyStreamers(outstanding, "week");
  return NextResponse.json({
    ok: true,
    since: since.toISOString(),
    until: until.toISOString(),
    outstanding: outstanding.length,
    unassigned: result.unassigned,
    streamersNotified: result.notified,
    streamersPinged: result.pinged,
  });
}
