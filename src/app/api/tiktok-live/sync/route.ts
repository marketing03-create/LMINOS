import { NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { syncTikTokLive } from "@/lib/tiktok-live/sync";

/** Manual "Sync now" trigger from the admin UI. Admin auth. */
export async function POST() {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  try {
    const out = await syncTikTokLive();
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
