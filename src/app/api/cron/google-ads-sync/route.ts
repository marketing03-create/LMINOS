import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import { syncGoogleAdsMetrics } from "@/lib/google-ads/sync";

/**
 * Pull daily Google Ads campaign metrics into ad_spend.
 * Trigger via an external scheduler (cron-job.org) hitting this URL with
 * `Authorization: Bearer ${CRON_SECRET}`. Daily is plenty — we always re-pull
 * a trailing window so late-arriving conversions are captured.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const out = await syncGoogleAdsMetrics();
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    console.error("[cron/google-ads-sync] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
