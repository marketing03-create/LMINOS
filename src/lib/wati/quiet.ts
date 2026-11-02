/**
 * "WhatsApp has gone quiet" alert. SERVER-ONLY.
 *
 * An account that normally hears from customers every day, but hasn't for
 * QUIET_HOURS during working hours, usually means WATI stopped calling TT Stars
 * (a webhook switched off, a number restricted) — not that customers stopped.
 * Every admin gets a bell + phone push, once per account per day.
 *
 * It can't hang off the webhook (a silent webhook is the problem), so it runs
 * from the admin dashboard's poll (/api/live-alerts), throttled per server.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { appNotifications, users, watiConnections, whatsappContacts } from "@/db/schema";
import { ADMIN_ROLES } from "@/lib/auth/authorize";
import { pushToUser } from "@/lib/notifications/push";
import { upsertUserNotification } from "@/lib/notifications/user-inbox";
import { isQuiet, inWorkingHours } from "./crosscheck-core";

const THROTTLE_MS = 10 * 60_000;

let lastRun = 0;

/** Never throws. */
export async function checkQuietAccounts(now = new Date()): Promise<void> {
  if (now.getTime() - lastRun < THROTTLE_MS || !inWorkingHours(now)) return;
  lastRun = now.getTime();
  try {
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const rows = await db
      .select({
        id: watiConnections.id,
        name: watiConnections.name,
        last: sql<string | null>`max(${whatsappContacts.lastMessageAt})`,
        week: sql<number>`(count(${whatsappContacts.id}) filter (where ${whatsappContacts.lastMessageAt} >= ${weekAgo.toISOString()}::timestamptz))::int`,
      })
      .from(watiConnections)
      .leftJoin(whatsappContacts, eq(whatsappContacts.connectionId, watiConnections.id))
      .where(eq(watiConnections.isActive, true))
      .groupBy(watiConnections.id);

    const day = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
    for (const r of rows) {
      const last = r.last ? new Date(r.last) : null;
      if (!isQuiet(last, Number(r.week), now)) continue;
      const hours = Math.floor((now.getTime() - last!.getTime()) / 3_600_000);
      const title = `No WhatsApp messages for ${hours}h`;
      const body = `${r.name} · check WATI's webhook is still on`;
      // Once per account per day: the insert is the claim.
      const claimed = await db
        .insert(appNotifications)
        .values({ type: "wati_quiet", title, body, href: "/admin/integrations", dedupeKey: `${r.id}:${day}` })
        .onConflictDoNothing()
        .returning({ id: appNotifications.id });
      if (claimed.length === 0) continue;

      const admins = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.role, ADMIN_ROLES), eq(users.isActive, true)));
      await Promise.all(
        admins.map(async (a) => {
          await upsertUserNotification({
            userId: a.id,
            type: "wati_quiet",
            title,
            body,
            href: "/admin/integrations",
            dedupeKey: `${r.id}:${day}`,
          });
          await pushToUser(a.id, { title, body, url: "/admin/integrations", tag: `wati-quiet-${r.id}` });
        })
      );
    }
  } catch (err) {
    console.error("[wati] quiet check failed:", err instanceof Error ? err.name : "error");
  }
}
