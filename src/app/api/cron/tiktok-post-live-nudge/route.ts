import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import { nudgePostLive } from "@/lib/tiktok-live/reminders";

/**
 * The ~1-hour post-live nudge: reminds a streamer to add their live metrics
 * (DMs, Bio views) about an hour after a live ends — once per live.
 *
 * This wants to run FREQUENTLY (hourly) so the nudge lands promptly. Vercel
 * Hobby caps crons at once/day, so it is deliberately NOT scheduled here in
 * vercel.ts. Point an hourly trigger at it instead — a free external scheduler
 * (e.g. cron-job.org) or the always-on Fly worker — sending:
 *     Authorization: Bearer ${CRON_SECRET}
 * Until then, the 10pm job calls the same logic as a daily catch-all, so no
 * live is ever left un-nudged.
 *
 * Idempotent: each live carries a `metrics_nudged_at` stamp, so calling this
 * every hour only ever nudges a given live once.
 *
 * Fail-closed on CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const result = await nudgePostLive();
  return NextResponse.json({ ok: true, ...result });
}
