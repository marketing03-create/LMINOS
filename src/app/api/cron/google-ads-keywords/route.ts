import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import { syncGoogleAdsKeywords } from "@/lib/google-ads/sync-keywords";

/**
 * Pull Google Ads keyword + search-term performance into LMIROS.
 * Trigger via cron-job.org with `Authorization: Bearer ${CRON_SECRET}` (daily).
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const out = await syncGoogleAdsKeywords();
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    console.error("[cron/google-ads-keywords] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
