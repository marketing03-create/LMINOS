import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import { syncZoho } from "@/lib/zoho/sync";

/**
 * Pull rows from the Zoho sales worksheet into LMIROS.
 * Trigger via Vercel Cron (daily on Hobby) or an external scheduler hitting
 * this URL with `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const out = await syncZoho();
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    console.error("[cron/zoho-sync] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
