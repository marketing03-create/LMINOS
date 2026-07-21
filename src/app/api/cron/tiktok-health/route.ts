import { NextResponse, type NextRequest } from "next/server";
import { gte } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokLiveSessions } from "@/db/schema";
import { cronAuthorized } from "@/lib/auth/cron";
import { alertAdmins } from "@/lib/telegram/alert";

/**
 * TikTok capture watchdog (catch-all net). Runs on a cron (daily) and pings the
 * admins on Telegram with a capture summary — so even if the worker's own
 * self-heal missed something, you get a daily heartbeat instead of silence.
 * Fail-closed on the CRON_SECRET bearer.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: tiktokLiveSessions.id })
    .from(tiktokLiveSessions)
    .where(gte(tiktokLiveSessions.startedAt, since));
  const count = rows.length;

  const text =
    count > 0
      ? `📹 TikTok capture OK — ${count} live${count === 1 ? "" : "s"} recorded in the last 24h.`
      : `⚠️ TikTok capture: 0 lives recorded in the last 24h. If a streamer went live, the capture may be down — check /admin/tiktok, or ask me to restart the worker.`;

  const alertsSent = await alertAdmins(text);
  return NextResponse.json({ ok: true, count, alertsSent });
}
