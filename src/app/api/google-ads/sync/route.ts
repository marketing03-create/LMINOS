import { NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { syncGoogleAdsMetrics } from "@/lib/google-ads/sync";
import { syncGoogleAdsHourly } from "@/lib/google-ads/sync-hourly";
import { syncGoogleAdsKeywords } from "@/lib/google-ads/sync-keywords";

// Many accounts run concurrently now (~1-2 min for 90); allow the max.
export const maxDuration = 300;

/**
 * Manual "Sync Google Ads now" trigger. Admin auth.
 * Refreshes the daily metrics (ad_spend → KPI cards, trends, account table,
 * ROAS), the hour-of-day metrics (hourly_metrics → the Overview "best hours"
 * heatmap), AND keyword + search-term data (keyword_metrics / search_terms →
 * Top Keywords + Wasted Spend on each ad account) — so one click refreshes
 * everything. Hourly + keywords are bounded to a recent window to keep the
 * manual sync inside the serverless limit (the daily crons keep the full window
 * fresh); an error in either never fails the whole run.
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

    // Top Keywords + Wasted Spend. Recent window (7d) so it stays fast alongside
    // the metrics + hourly sync; the daily keyword cron covers the full 30 days.
    let keywords: { keywordRows: number; searchTermRows: number; errors: number } = {
      keywordRows: 0,
      searchTermRows: 0,
      errors: 0,
    };
    try {
      const k = await syncGoogleAdsKeywords({ days: 7 });
      keywords = {
        keywordRows: k.keywordRows,
        searchTermRows: k.searchTermRows,
        errors: k.errors.length,
      };
    } catch {
      keywords = { keywordRows: 0, searchTermRows: 0, errors: 1 };
    }

    return NextResponse.json({ ok: true, ...out, hourly, keywords });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
