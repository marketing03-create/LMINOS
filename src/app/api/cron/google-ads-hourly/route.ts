import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import { syncGoogleAdsHourly } from "@/lib/google-ads/sync-hourly";

/**
 * Pull Google Ads hour-of-day performance into LMIROS (golden-hour analysis).
 * Trigger via cron-job.org with `Authorization: Bearer ${CRON_SECRET}` (daily).
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const out = await syncGoogleAdsHourly();
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    console.error("[cron/google-ads-hourly] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
