import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { markNotificationsRead } from "@/lib/notifications/user-inbox";

/**
 * Mark the caller's notifications read — specific `ids`, or all unread when the
 * body is empty. Always scoped to the caller's own userId.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(["live_streamer", ...ADMIN_ROLES]);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  // The dev auth-bypass resolves to a role but NO userId. Bail before building
  // the UPDATE — an unscoped one would mark every user's inbox read.
  if (!auth.userId) return NextResponse.json({ ok: true, updated: 0 });

  const body = (await request.json().catch(() => null)) as {
    ids?: unknown;
  } | null;

  let ids: string[] | undefined;
  if (Array.isArray(body?.ids)) {
    if (body.ids.length > 200) {
      return NextResponse.json(
        { ok: false, error: "too many ids (max 200)" },
        { status: 400 }
      );
    }
    ids = body.ids.filter((x): x is string => typeof x === "string");
  }

  const updated = await markNotificationsRead(auth.userId, ids);
  return NextResponse.json({ ok: true, updated });
}
