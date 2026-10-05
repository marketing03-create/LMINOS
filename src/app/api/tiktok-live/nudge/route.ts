import { NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { sendAdminNudge } from "@/lib/tiktok-live/admin-nudge";

/**
 * Admin → every active streamer who still owes numbers: an in-app reminder
 * (plus Telegram where linked). Admins only — a streamer cannot nudge anyone.
 */
export async function POST() {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  try {
    const result = await sendAdminNudge(auth.userId ?? null);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
