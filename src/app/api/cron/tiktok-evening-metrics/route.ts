import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import {
  lookbackWindow,
  liveMetricsIncompleteCondition,
} from "@/lib/tiktok-live/completeness";
import {
  findOutstanding,
  notifyStreamers,
  nudgePostLive,
} from "@/lib/tiktok-live/reminders";

/**
 * The 10pm Malaysia-time LIVE-METRICS re-check. Any live still missing DMs or
 * Bio views gets its streamer re-nagged (in-app + Telegram), so nothing a
 * streamer forgot after the show slips to the next day unnoticed.
 *
 * It also runs the post-live nudge as a daily CATCH-ALL, so even without the
 * ~1h trigger wired up, every finished live gets its first nudge by 10pm at the
 * latest. (That ~1h trigger needs a sub-daily schedule — see the post-live
 * endpoint — which Vercel Hobby can't run, so this guarantees a floor.)
 *
 * Fail-closed on CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  // First-nudge anything that ended ≥1h ago and was never nudged (idempotent).
  const postLive = await nudgePostLive();

  // Then re-nag every live still missing its streamer metrics across the window.
  const { since, until } = lookbackWindow();
  const outstanding = await findOutstanding(since, until, liveMetricsIncompleteCondition());
  const reNag = await notifyStreamers(outstanding, "live");

  return NextResponse.json({
    ok: true,
    postLive,
    outstanding: outstanding.length,
    streamersNotified: reNag.notified,
    streamersPinged: reNag.pinged,
    unassigned: reNag.unassigned,
  });
}
