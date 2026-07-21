import { NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { appNotifications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/authorize";

const ADMIN = new Set(["hq_admin", "marketing_manager"]);

/**
 * Recent in-app pop-out notifications for the dashboard notifier to poll.
 * Admins only (non-admins get an empty list, never a 403 — the poller is
 * fire-and-forget). Returns the last ~10 minutes so a just-opened tab can still
 * surface a live that started moments ago; the client dedupes + freshness-gates.
 */
export async function GET() {
  const me = await getSessionUser();
  if (!me || !ADMIN.has(me.role)) {
    return NextResponse.json({ notifications: [] });
  }

  const since = new Date(Date.now() - 10 * 60 * 1000);
  try {
    const rows = await db
      .select({
        id: appNotifications.id,
        type: appNotifications.type,
        title: appNotifications.title,
        body: appNotifications.body,
        handle: appNotifications.handle,
        href: appNotifications.href,
        createdAt: appNotifications.createdAt,
      })
      .from(appNotifications)
      .where(gte(appNotifications.createdAt, since))
      .orderBy(desc(appNotifications.createdAt))
      .limit(20);
    return NextResponse.json({ notifications: rows });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}
