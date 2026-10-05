import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/authorize";
import { completeMyNudge } from "@/lib/tiktok-live/admin-nudge";

/**
 * The streamer's Done on an admin reminder. Scoped to the caller's own row, and
 * refused (409) while any live it named still owes numbers.
 */
export async function POST() {
  const auth = await requireRole(["live_streamer"]);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  // The dev bypass has a role but no id; there is no row of "nobody's" to clear.
  if (!auth.userId) return NextResponse.json({ ok: true });

  const result = await completeMyNudge(auth.userId);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `${result.remaining} live${result.remaining === 1 ? "" : "s"} still need${
          result.remaining === 1 ? "s" : ""
        } numbers.`,
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
