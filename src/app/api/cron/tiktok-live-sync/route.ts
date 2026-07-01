import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import { syncTikTokLive } from "@/lib/tiktok-live/sync";

/**
 * Pull TikTok LIVE session summaries from the managed vendor into LMIROS.
 * Trigger via cron-job.org with `Authorization: Bearer ${CRON_SECRET}` (daily).
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const out = await syncTikTokLive();
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    console.error("[cron/tiktok-live-sync] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
