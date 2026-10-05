import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { sendAdminNudge } from "@/lib/tiktok-live/admin-nudge";

/**
 * Admin → every active streamer who still owes numbers: an in-app reminder
 * (plus a phone notification where turned on). Admins only — a streamer cannot
 * nudge anyone. Body `{ streamerIds: [...] }` narrows it to those streamers;
 * an empty or missing body means everyone who owes numbers.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { streamerIds?: unknown } | null;
  let streamerIds: string[] | undefined;
  if (body && "streamerIds" in body) {
    if (!Array.isArray(body.streamerIds) || body.streamerIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Pick at least one streamer." }, { status: 400 });
    }
    streamerIds = body.streamerIds.filter((x): x is string => typeof x === "string").slice(0, 200);
  }

  try {
    const result = await sendAdminNudge(auth.userId ?? null, streamerIds);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
