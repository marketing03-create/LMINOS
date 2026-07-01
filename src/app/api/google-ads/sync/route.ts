import { NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { syncGoogleAdsMetrics } from "@/lib/google-ads/sync";
import { syncGoogleAdsHourly } from "@/lib/google-ads/sync-hourly";

// Many accounts run concurrently now (~1-2 min for 90); allow the max.
export const maxDuration = 300;

/**
 * Manual "Sync Google Ads now" trigger. Admin auth.
 * Refreshes BOTH the daily metrics (ad_spend → KPI cards, trends, account table,
 * ROAS) AND the hour-of-day metrics (hourly_metrics → the Overview "best hours"
 * heatmap), so every chart on the Overview reflects the latest after one click.
 * Hourly is bounded to 30 days to keep the manual sync responsive (the daily
 * cron keeps the full 90-day window fresh); an hourly error never fails the run.
 */
export async function POST() {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  try {
    const out = await syncGoogleAdsMetrics();

    let hourly: { rows: number; errors: number } = { rows: 0, errors: 0 };
    try {
      const h = await syncGoogleAdsHourly({ days: 30 });
      hourly = { rows: h.rows, errors: h.errors.length };
    } catch {
      hourly = { rows: 0, errors: 1 };
    }

    return NextResponse.json({ ok: true, ...out, hourly });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
