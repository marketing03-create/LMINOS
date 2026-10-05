/**
 * The admin's "Notify streamers" button and the streamer's "Done" that answers
 * it. SERVER-ONLY.
 *
 * It rides on the Notification Center (`user_notifications`): one row per
 * streamer of its own `type`, so it shows in the bell like every other reminder
 * and an admin can press the button any number of times without stacking rows.
 *
 * Two things set it apart from the automatic reminders in reminders.ts:
 *
 *  - It does NOT auto-clear. The automatic ones vanish the moment the numbers
 *    are in; this one stays until the streamer taps Done, because the admin
 *    asked a person, and the answer the admin wants back is that person
 *    saying "done" — see `stillOwes` in user-inbox.ts.
 *  - Done is refused while any live it named still owes numbers. A Done that
 *    could be tapped with the work undone would tell the admin nothing.
 *
 * "Still owes numbers" is the one shared definition (completeness.ts): Total
 * Leads, Filtered Leads, DMs and Bio views, over the last 14 days, ignoring
 * test lives under 5 minutes and lives still running.
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLogs,
  tiktokAccounts,
  tiktokLiveSessions,
  userNotifications,
  users,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { escapeMd, sendMarkdown } from "@/lib/telegram/send";
import { upsertUserNotification } from "@/lib/notifications/user-inbox";
import {
  METRIC_LABEL,
  incompleteCondition,
  lookbackWindow,
  missingMetrics,
  outstandingCondition,
  type RequiredMetric,
} from "./completeness";

export const NUDGE_TYPE = "tiktok_admin_nudge";
const NUDGE_KEY = "admin";
const SENT_EVENT = "tiktok_live.admin_nudge_sent";
const DONE_EVENT = "tiktok_live.admin_nudge_done";
const MAX_LISTED = 10;
/** A second press inside this window refreshes the inbox row but sends no second Telegram DM. */
const TELEGRAM_COOLDOWN_MS = 10 * 60 * 1000;

const whenFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export type OwedLive = {
  sessionId: string;
  handle: string;
  startedAt: Date | null;
  missing: RequiredMetric[];
};

const METRIC_COLS = {
  totalLeads: tiktokLiveSessions.totalLeads,
  filteredLeads: tiktokLiveSessions.filteredLeads,
  directMessages: tiktokLiveSessions.directMessages,
  serviceBioViews: tiktokLiveSessions.serviceBioViews,
};

/** Every finished live in the window still owing numbers, with its active streamer. */
async function owedByStreamer(): Promise<
  Map<string, { email: string; chatId: string | null; lives: OwedLive[] }>
> {
  const { since, until } = lookbackWindow();
  const rows = await db
    .select({
      sessionId: tiktokLiveSessions.id,
      handle: tiktokAccounts.handle,
      startedAt: tiktokLiveSessions.startedAt,
      streamerId: users.id,
      email: users.email,
      chatId: users.telegramChatId,
      ...METRIC_COLS,
    })
    .from(tiktokLiveSessions)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
    .innerJoin(users, eq(users.id, tiktokAccounts.assignedStreamerId))
    .where(
      and(
        outstandingCondition(since, until, incompleteCondition()),
        isNotNull(tiktokLiveSessions.endedAt),
        eq(users.role, "live_streamer"),
        eq(users.isActive, true)
      )
    )
    .orderBy(desc(tiktokLiveSessions.startedAt));

  const out = new Map<string, { email: string; chatId: string | null; lives: OwedLive[] }>();
  for (const r of rows) {
    const g = out.get(r.streamerId) ?? { email: r.email, chatId: r.chatId, lives: [] };
    g.lives.push({
      sessionId: r.sessionId,
      handle: r.handle,
      startedAt: r.startedAt,
      missing: missingMetrics(r),
    });
    out.set(r.streamerId, g);
  }
  return out;
}

const plural = (n: number) => `${n} live${n === 1 ? "" : "s"}`;

function lineFor(l: OwedLive): string {
  return (
    `• @${l.handle}${l.startedAt ? ` · ${whenFmt.format(l.startedAt)}` : ""}` +
    ` — missing ${l.missing.map((m) => METRIC_LABEL[m]).join(", ")}`
  );
}

/**
 * Notify every active streamer who owes numbers. One inbox row each (refreshed
 * and made unread again on every press), a Telegram DM where they have one
 * linked, and an audit row per streamer so the admin panel can show who was
 * told when.
 */
export async function sendAdminNudge(actorUserId: string | null): Promise<{
  streamers: number;
  lives: number;
  pinged: number;
}> {
  const owed = await owedByStreamer();
  let lives = 0;
  let pinged = 0;

  for (const [streamerId, g] of owed) {
    const n = g.lives.length;
    lives += n;

    const [prev] = await db
      .select({ updatedAt: userNotifications.updatedAt })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, streamerId),
          eq(userNotifications.type, NUDGE_TYPE),
          eq(userNotifications.dedupeKey, NUDGE_KEY)
        )
      )
      .limit(1);
    const recentlyPinged =
      !!prev && Date.now() - prev.updatedAt.getTime() < TELEGRAM_COOLDOWN_MS;

    await upsertUserNotification({
      userId: streamerId,
      type: NUDGE_TYPE,
      dedupeKey: NUDGE_KEY,
      title: `${plural(n)} still need${n === 1 ? "s" : ""} your numbers`,
      body: "Fill them in, then tap Done on your Home page.",
      href: "/tiktok-live",
      sessionIds: g.lives.map((l) => l.sessionId),
    });

    await writeAudit({
      actorUserId,
      eventType: SENT_EVENT,
      entityType: "user",
      entityId: streamerId,
      after: { lives: n, sessionIds: g.lives.map((l) => l.sessionId) },
    });

    if (g.chatId && !recentlyPinged) {
      const listed = g.lives.slice(0, MAX_LISTED).map(lineFor).join("\n");
      const more = n > MAX_LISTED ? `\n…and ${n - MAX_LISTED} more` : "";
      const text =
        `📣 Reminder from admin: ${plural(n)} still need${n === 1 ? "s" : ""} your numbers:\n` +
        `${listed}${more}\n\nFill them in on LMIROS, then tap Done on your Home page.`;
      try {
        const res = await sendMarkdown(g.chatId, escapeMd(text));
        if (res.ok) pinged += 1;
      } catch {
        // best-effort — the in-app reminder is already written
      }
    }
  }

  return { streamers: owed.size, lives, pinged };
}

/** The streamer's open admin reminder, with the lives it named re-checked now. */
export async function getMyNudge(userId: string): Promise<{
  sentAt: Date;
  total: number;
  remaining: OwedLive[];
} | null> {
  const [row] = await db
    .select({
      updatedAt: userNotifications.updatedAt,
      sessionIds: userNotifications.sessionIds,
    })
    .from(userNotifications)
    .where(
      and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.type, NUDGE_TYPE),
        eq(userNotifications.dedupeKey, NUDGE_KEY)
      )
    )
    .limit(1);
  if (!row) return null;

  const ids = row.sessionIds ?? [];
  const cells = ids.length
    ? await db
        .select({
          sessionId: tiktokLiveSessions.id,
          handle: tiktokAccounts.handle,
          startedAt: tiktokLiveSessions.startedAt,
          ...METRIC_COLS,
        })
        .from(tiktokLiveSessions)
        .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
        .where(inArray(tiktokLiveSessions.id, ids))
        .orderBy(desc(tiktokLiveSessions.startedAt))
    : [];

  const remaining = cells
    .map((c) => ({
      sessionId: c.sessionId,
      handle: c.handle,
      startedAt: c.startedAt,
      missing: missingMetrics(c),
    }))
    .filter((l) => l.missing.length > 0);

  return { sentAt: row.updatedAt, total: ids.length, remaining };
}

/**
 * The streamer's Done. Refused while any named live still owes numbers;
 * otherwise the reminder row goes and an audit row records when.
 */
export async function completeMyNudge(
  userId: string
): Promise<{ ok: true } | { ok: false; remaining: number }> {
  const nudge = await getMyNudge(userId);
  if (!nudge) return { ok: true }; // already done (double tap, second device)
  if (nudge.remaining.length > 0) return { ok: false, remaining: nudge.remaining.length };

  await db
    .delete(userNotifications)
    .where(
      and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.type, NUDGE_TYPE),
        eq(userNotifications.dedupeKey, NUDGE_KEY)
      )
    );
  await writeAudit({
    actorUserId: userId,
    eventType: DONE_EVENT,
    entityType: "user",
    entityId: userId,
    after: { lives: nudge.total, sentAt: nudge.sentAt.toISOString() },
  });
  return { ok: true };
}

export type NudgeStatusRow = {
  streamerId: string;
  email: string;
  name: string | null;
  owed: number;
  /** An open reminder: when it was last sent. */
  pendingSince: Date | null;
  /** Their most recent Done. */
  doneAt: Date | null;
};

/** One row per active streamer for the admin panel, most behind first. */
export async function nudgeStatus(): Promise<NudgeStatusRow[]> {
  const streamers = await db
    .select({ id: users.id, email: users.email, name: users.fullName })
    .from(users)
    .where(and(eq(users.role, "live_streamer"), eq(users.isActive, true)));
  if (streamers.length === 0) return [];
  const ids = streamers.map((s) => s.id);

  const [owed, pending, done] = await Promise.all([
    owedByStreamer(),
    db
      .select({ userId: userNotifications.userId, updatedAt: userNotifications.updatedAt })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.type, NUDGE_TYPE),
          inArray(userNotifications.userId, ids)
        )
      ),
    db
      .select({ entityId: auditLogs.entityId, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(eq(auditLogs.eventType, DONE_EVENT), inArray(auditLogs.entityId, ids)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(500),
  ]);

  const pendingBy = new Map(pending.map((p) => [p.userId, p.updatedAt]));
  const doneBy = new Map<string, Date>();
  for (const d of done) if (!doneBy.has(d.entityId)) doneBy.set(d.entityId, d.createdAt);

  return streamers
    .map((s) => ({
      streamerId: s.id,
      email: s.email,
      name: s.name,
      owed: owed.get(s.id)?.lives.length ?? 0,
      pendingSince: pendingBy.get(s.id) ?? null,
      doneAt: doneBy.get(s.id) ?? null,
    }))
    .sort((a, b) => b.owed - a.owed || a.email.localeCompare(b.email));
}
