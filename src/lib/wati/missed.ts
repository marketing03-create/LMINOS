/**
 * Per-account upkeep, and the missed-lead alert it ends with. SERVER-ONLY.
 *
 * There is no sub-daily cron on this plan, so `maintainConnection` rides on the
 * webhook: every WATI call may run it, at most once per THROTTLE_MIN per
 * account. On a live night WATI calls constantly, which is exactly when it
 * matters. Each run first reads reply times from the API (sync.ts), then
 * alerts: a lead nobody has answered for MISSED_AFTER_MIN minutes buzzes every
 * admin (in-app bell + phone push).
 *
 * The alert never fires for an account whose replies aren't tracked yet —
 * without them every lead looks unanswered — and only for leads that arrived
 * after tracking began. Each lead is alerted about once. Quiet between 11pm and
 * 9am Malaysia time.
 */
import { and, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { users, watiConnections, whatsappContacts } from "@/db/schema";
import { ADMIN_ROLES } from "@/lib/auth/authorize";
import { upsertUserNotification } from "@/lib/notifications/user-inbox";
import { pushToUser } from "@/lib/notifications/push";
import { syncRepliesFromApi } from "./sync";

export const MISSED_AFTER_MIN = 15;
const THROTTLE_MIN = 3;
const LOOKBACK_HOURS = 6;

function mytHour(d: Date): number {
  return (d.getUTCHours() + 8) % 24;
}

function mytDay(d: Date): string {
  return new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** The webhook's after-response hook. Never throws. */
export async function maintainConnection(connectionId: string, now = new Date()): Promise<void> {
  try {
    // Claim this run: only one caller per THROTTLE_MIN wins the update.
    const throttle = new Date(now.getTime() - THROTTLE_MIN * 60_000);
    const claimed = await db
      .update(watiConnections)
      .set({ missedCheckedAt: now })
      .where(
        and(
          eq(watiConnections.id, connectionId),
          or(isNull(watiConnections.missedCheckedAt), lt(watiConnections.missedCheckedAt, throttle))
        )
      )
      .returning({ id: watiConnections.id });
    if (claimed.length === 0) return;

    await syncRepliesFromApi(connectionId, now);
    await sweepMissedLeads(connectionId, now);
  } catch (err) {
    console.error("[wati] upkeep failed:", err);
  }
}

async function sweepMissedLeads(connectionId: string, now: Date): Promise<number> {
  try {
    const hour = mytHour(now);
    if (hour < 9 || hour >= 23) return 0;

    const conn = await db.query.watiConnections.findFirst({
      where: eq(watiConnections.id, connectionId),
      columns: { name: true, repliesSeenAt: true },
    });
    if (!conn?.repliesSeenAt) return 0;

    const waitingSince = new Date(now.getTime() - MISSED_AFTER_MIN * 60_000);
    const lookback = new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000);
    const floor = conn.repliesSeenAt > lookback ? conn.repliesSeenAt : lookback;
    const waiting = await db
      .update(whatsappContacts)
      .set({ missedAlertedAt: now })
      .where(
        and(
          eq(whatsappContacts.connectionId, connectionId),
          isNull(whatsappContacts.firstReplyAt),
          isNull(whatsappContacts.missedAlertedAt),
          gte(whatsappContacts.firstMessageAt, floor),
          lte(whatsappContacts.firstMessageAt, waitingSince)
        )
      )
      .returning({ firstMessageAt: whatsappContacts.firstMessageAt });
    if (waiting.length === 0) return 0;

    const oldest = Math.min(...waiting.map((w) => w.firstMessageAt.getTime()));
    const mins = Math.round((now.getTime() - oldest) / 60_000);
    const n = waiting.length;
    const title = `${n} WhatsApp lead${n === 1 ? "" : "s"} waiting`;
    const body = `${conn.name} · no reply for ${mins} min`;

    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ADMIN_ROLES), eq(users.isActive, true)));
    await Promise.all(
      admins.map(async (a) => {
        await upsertUserNotification({
          userId: a.id,
          type: "wati_missed_leads",
          title,
          body,
          href: "/admin/integrations",
          dedupeKey: `${connectionId}:${mytDay(now)}`,
        });
        await pushToUser(a.id, { title, body, url: "/admin/integrations", tag: `wati-missed-${connectionId}` });
      })
    );
    return n;
  } catch (err) {
    console.error("[wati] missed-lead sweep failed:", err);
    return 0;
  }
}
