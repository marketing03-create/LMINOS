import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import { syncAllTabs } from "@/lib/sheets/sync";

/**
 * Runs every 2 minutes via Vercel Cron (see vercel.ts).
 * Sweeps every tab registered in sheet_sync_state. Failures are isolated
 * per tab and recorded in `last_error`.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  try {
    const out = await syncAllTabs();
    return NextResponse.json(out);
  } catch (err) {
    console.error("[cron/sheets-sync] global failure:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
