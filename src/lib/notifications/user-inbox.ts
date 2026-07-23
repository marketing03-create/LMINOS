/**
 * The per-user Notification Center inbox (bell + badge + list). SERVER-ONLY.
 *
 * AUTO-CLEAR: a notification that references lives (`sessionIds`) disappears as
 * soon as none of those lives are missing metrics any more. That's resolved at
 * READ time rather than by a job, so the badge drops the instant the streamer
 * hits Save — no write, no cron, self-healing.
 */
import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokLiveSessions, userNotifications } from "@/db/schema";
import {
  missingLeadMetrics,
  missingLiveMetrics,
  missingMetrics,
} from "@/lib/tiktok-live/completeness";

export type InboxRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  sessionIds: string[] | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Which "still owes numbers" test applies to a notification, by its type. A
 * leads reminder resolves when the LEAD metrics are in; a live-metrics reminder
 * resolves when the STREAMER metrics are in — independently, so filling one
 * clears its reminder without waiting on the other. Anything else (legacy /
 * unknown) falls back to "all four", the safe superset.
 */
function stillOwes(type: string, row: MetricRow): boolean {
  if (type === "tiktok_missing_leads") return missingLeadMetrics(row).length > 0;
  if (type === "tiktok_missing_metrics") return missingLiveMetrics(row).length > 0;
  return missingMetrics(row).length > 0;
}

type MetricRow = {
  totalLeads: number | null;
  filteredLeads: number | null;
  directMessages: number | null;
  serviceBioViews: number | null;
};

/**
 * Drop rows whose referenced lives are all complete FOR THAT ROW'S metric group.
 * Rows with no sessionIds (generic notifications) are always kept.
 */
async function filterUnresolved(rows: InboxRow[]): Promise<InboxRow[]> {
  const ids = [...new Set(rows.flatMap((r) => r.sessionIds ?? []))];
  if (ids.length === 0) return rows;

  // Pull each referenced live's four metric cells once; decide open-ness per row.
  const cells = await db
    .select({
      id: tiktokLiveSessions.id,
      totalLeads: tiktokLiveSessions.totalLeads,
      filteredLeads: tiktokLiveSessions.filteredLeads,
      directMessages: tiktokLiveSessions.directMessages,
      serviceBioViews: tiktokLiveSessions.serviceBioViews,
    })
    .from(tiktokLiveSessions)
    .where(inArray(tiktokLiveSessions.id, ids));
  const byId = new Map(cells.map((c) => [c.id, c]));

  return rows.filter((r) => {
    const refs = r.sessionIds ?? [];
    if (refs.length === 0) return true; // not a live-linked notification
    // Keep the reminder while ANY referenced live still owes THIS row's group.
    return refs.some((id) => {
      const row = byId.get(id);
      return row ? stillOwes(r.type, row) : false;
    });
  });
}

/** Newest-first inbox for one user, already auto-cleared. */
export async function listUserNotifications(
  userId: string,
  limit = 50
): Promise<InboxRow[]> {
  const rows = (await db
    .select()
    .from(userNotifications)
    .where(eq(userNotifications.userId, userId))
    .orderBy(desc(userNotifications.updatedAt))
    .limit(limit)) as InboxRow[];
  return filterUnresolved(rows);
}

/** Badge count: unread AND not auto-cleared. */
export async function unreadNotificationCount(userId: string): Promise<number> {
  const rows = (await db
    .select()
    .from(userNotifications)
    .where(
      and(
        eq(userNotifications.userId, userId),
        isNull(userNotifications.readAt)
      )
    )
    .orderBy(desc(userNotifications.updatedAt))
    .limit(100)) as InboxRow[];
  const live = await filterUnresolved(rows);
  return live.length;
}

/**
 * Mark notifications read. ALWAYS scoped to the user — never call without a
 * real userId (the dev auth bypass has none, and an unscoped UPDATE would mark
 * every user's inbox read).
 */
export async function markNotificationsRead(
  userId: string,
  ids?: string[]
): Promise<number> {
  const where = ids?.length
    ? and(
        eq(userNotifications.userId, userId),
        isNull(userNotifications.readAt),
        inArray(userNotifications.id, ids)
      )
    : and(
        eq(userNotifications.userId, userId),
        isNull(userNotifications.readAt)
      );

  const updated = await db
    .update(userNotifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(where)
    .returning({ id: userNotifications.id });
  return updated.length;
}

/**
 * Idempotent write. One row per (user, type, dedupeKey) — re-running refreshes
 * the content and RESETS readAt, which is what re-surfaces the badge each
 * morning while a live is still unfinished (instead of stacking a new row a day).
 */
export async function upsertUserNotification(input: {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  sessionIds?: string[];
  dedupeKey: string;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(userNotifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      sessionIds: input.sessionIds ?? null,
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoUpdate({
      target: [
        userNotifications.userId,
        userNotifications.type,
        userNotifications.dedupeKey,
      ],
      set: {
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        sessionIds: input.sessionIds ?? null,
        readAt: null, // re-nag: unread again each morning
        updatedAt: now,
      },
    });
}
