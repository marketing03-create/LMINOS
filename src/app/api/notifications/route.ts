import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/authorize";
import {
  listUserNotifications,
  unreadNotificationCount,
} from "@/lib/notifications/user-inbox";

/**
 * The signed-in user's Notification Center feed + unread badge count.
 *
 * Deliberately fire-and-forget like /api/live-alerts: no session (or the dev
 * bypass, which has no userId) returns an EMPTY 200 rather than a 401, so the
 * bell's poller never has to handle auth errors. The query is scoped to the
 * caller's own userId, so no role check is needed — a user can only ever read
 * their own inbox.
 */
export async function GET(request: NextRequest) {
  const me = await getSessionUser();
  if (!me?.userId) {
    return NextResponse.json({ unread: 0, notifications: [] });
  }

  const sp = request.nextUrl.searchParams;
  const countOnly = sp.get("countOnly") === "1";
  const raw = Number(sp.get("limit"));
  const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, raw)) : 20;

  try {
    const unread = await unreadNotificationCount(me.userId);
    if (countOnly) return NextResponse.json({ unread, notifications: [] });

    const rows = await listUserNotifications(me.userId, limit);
    return NextResponse.json({
      unread,
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        href: r.href,
        readAt: r.readAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch {
    return NextResponse.json({ unread: 0, notifications: [] });
  }
}
