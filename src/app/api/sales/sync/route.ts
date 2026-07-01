import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncAllTabs } from "@/lib/sheets/sync";

/**
 * Manual trigger of the sheets sync (admin button in /admin/integrations).
 * Same logic as the cron, but auth'd via Supabase session.
 */
export async function POST(_request: NextRequest) {
  if (process.env.LMIROS_DEV_BYPASS_AUTH !== "true") {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse("unauthorized", { status: 401 });
  }

  try {
    const out = await syncAllTabs();
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
