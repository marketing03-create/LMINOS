/**
 * TikTok DMs through WATI — saving and reading. SERVER-ONLY. Payload rules in
 * tiktok-core.ts; tables in db/schema/tiktok-dms.ts (apart from WhatsApp, so a
 * DM never counts as a WhatsApp lead).
 *
 * A DM is filed under the WATI account + TikTok channel it came through; the
 * channel is linked to a TT Stars handle automatically when WATI names it the
 * same, else by an admin on Integrations. DMs per live = TikTok users whose
 * FIRST DM to that handle falls in the live's window (start → end + 3h, closed
 * early by the handle's next live) — the same window as WhatsApp leads.
 */
import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  tiktokAccounts,
  tiktokDmChannels,
  tiktokDmContacts,
  tiktokDmDays,
  tiktokLiveSessions,
  watiConnections,
  watiUnknownEvents,
} from "@/db/schema";
import { liveWindows } from "./attribution";
import { chatDay } from "./chats";
import { watiChatUrl } from "./payload";
import { shapeOf, shapeSignature, type TikTokMessage } from "./tiktok-core";

const norm = (h: string) => h.trim().replace(/^@/, "").toLowerCase();

/** Save one TikTok DM (in or out). Idempotent: WATI retries change nothing but times. */
export async function recordTikTokMessage(connectionId: string, m: TikTokMessage, now = new Date()): Promise<void> {
  // The channel, linked to the handle WATI names (when it names one we have).
  let accountId: string | null = null;
  if (m.channelLabel) {
    const [acct] = await db
      .select({ id: tiktokAccounts.id })
      .from(tiktokAccounts)
      .where(sql`lower(${tiktokAccounts.handle}) = ${norm(m.channelLabel)}`)
      .limit(1);
    accountId = acct?.id ?? null;
  }
  await db
    .insert(tiktokDmChannels)
    .values({ connectionId, channelId: m.channelId, accountId, label: m.channelLabel, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [tiktokDmChannels.connectionId, tiktokDmChannels.channelId],
      set: {
        lastSeenAt: now,
        label: sql`coalesce(excluded.label, ${tiktokDmChannels.label})`,
        // Only fills a link nobody set; an admin's choice is never overwritten.
        accountId: sql`coalesce(${tiktokDmChannels.accountId}, excluded.account_id)`,
        updatedAt: now,
      },
    });

  const key = and(
    eq(tiktokDmContacts.connectionId, connectionId),
    eq(tiktokDmContacts.channelId, m.channelId),
    eq(tiktokDmContacts.senderId, m.senderId)
  );
  const iso = m.at.toISOString();

  if (m.direction === "out") {
    // CS writing to someone who never wrote first isn't a DM lead.
    await db
      .update(tiktokDmContacts)
      .set({
        latestMessageText: sql`case when ${tiktokDmContacts.latestMessageAt} is null or ${tiktokDmContacts.latestMessageAt} <= ${iso}::timestamptz then ${m.text} else ${tiktokDmContacts.latestMessageText} end`,
        latestMessageFrom: sql`case when ${tiktokDmContacts.latestMessageAt} is null or ${tiktokDmContacts.latestMessageAt} <= ${iso}::timestamptz then 'cs' else ${tiktokDmContacts.latestMessageFrom} end`,
        latestMessageAt: sql`greatest(${tiktokDmContacts.latestMessageAt}, ${iso}::timestamptz)`,
        firstReplyAt: sql`case when ${tiktokDmContacts.firstReplyAt} is null and ${iso}::timestamptz >= ${tiktokDmContacts.firstMessageAt} then ${iso}::timestamptz else ${tiktokDmContacts.firstReplyAt} end`,
        firstReplyBy: sql`case when ${tiktokDmContacts.firstReplyAt} is null and ${iso}::timestamptz >= ${tiktokDmContacts.firstMessageAt} then ${m.by} else ${tiktokDmContacts.firstReplyBy} end`,
        updatedAt: now,
      })
      .where(key);
    return;
  }

  const ex = sql.raw("excluded");
  const [saved] = await db
    .insert(tiktokDmContacts)
    .values({
      connectionId,
      channelId: m.channelId,
      senderId: m.senderId,
      name: m.name,
      firstMessageAt: m.at,
      lastMessageAt: m.at,
      firstMessageText: m.text,
      latestMessageText: m.text,
      latestMessageAt: m.at,
      latestMessageFrom: "customer",
      watiConversationId: m.conversationId,
    })
    .onConflictDoUpdate({
      target: [tiktokDmContacts.connectionId, tiktokDmContacts.channelId, tiktokDmContacts.senderId],
      set: {
        firstMessageText: sql`case when ${ex}.first_message_at < ${tiktokDmContacts.firstMessageAt} then ${ex}.first_message_text else ${tiktokDmContacts.firstMessageText} end`,
        firstMessageAt: sql`least(${tiktokDmContacts.firstMessageAt}, ${ex}.first_message_at)`,
        lastMessageAt: sql`greatest(${tiktokDmContacts.lastMessageAt}, ${ex}.last_message_at)`,
        name: sql`coalesce(${ex}.name, ${tiktokDmContacts.name})`,
        watiConversationId: sql`coalesce(${ex}.wati_conversation_id, ${tiktokDmContacts.watiConversationId})`,
        latestMessageText: sql`case when ${tiktokDmContacts.latestMessageAt} is null or ${ex}.latest_message_at >= ${tiktokDmContacts.latestMessageAt} then ${ex}.latest_message_text else ${tiktokDmContacts.latestMessageText} end`,
        latestMessageFrom: sql`case when ${tiktokDmContacts.latestMessageAt} is null or ${ex}.latest_message_at >= ${tiktokDmContacts.latestMessageAt} then 'customer' else ${tiktokDmContacts.latestMessageFrom} end`,
        latestMessageAt: sql`greatest(${tiktokDmContacts.latestMessageAt}, ${ex}.latest_message_at)`,
        updatedAt: now,
      },
    })
    .returning({ id: tiktokDmContacts.id });
  if (!saved) return;
  await db
    .insert(tiktokDmDays)
    .values({ contactId: saved.id, day: chatDay(m.at), firstAt: m.at, lastAt: m.at })
    .onConflictDoUpdate({
      target: [tiktokDmDays.contactId, tiktokDmDays.day],
      set: {
        firstAt: sql`least(${tiktokDmDays.firstAt}, ${iso}::timestamptz)`,
        lastAt: sql`greatest(${tiktokDmDays.lastAt}, ${iso}::timestamptz)`,
        updatedAt: now,
      },
    });
}

/** Keep the SHAPE of a body TT Stars couldn't read (never its values). Best-effort. */
export async function recordUnknownEvent(connectionId: string, body: unknown, eventType: string | null, now = new Date()) {
  const shape = shapeOf(body);
  const signature = shapeSignature(shape);
  if (!signature) return;
  await db
    .insert(watiUnknownEvents)
    .values({ connectionId, signature, eventType, shape, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [watiUnknownEvents.connectionId, watiUnknownEvents.signature],
      set: { count: sql`${watiUnknownEvents.count} + 1`, lastSeenAt: now },
    })
    .catch(() => {});
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Handles that have a TikTok DM channel linked, so a live's DM count is real (absent = unknown, not 0). */
async function linkedChannels() {
  return db
    .select({
      connectionId: tiktokDmChannels.connectionId,
      channelId: tiktokDmChannels.channelId,
      accountId: tiktokDmChannels.accountId,
      firstSeenAt: tiktokDmChannels.firstSeenAt,
    })
    .from(tiktokDmChannels)
    .where(sql`${tiktokDmChannels.accountId} is not null`);
}

/**
 * New TikTok DMs per live (users whose first DM to the handle fell in the
 * live's window). Lives of handles with no DM channel linked, or that ended
 * before the channel was first seen, are absent — no false 0.
 */
export async function tiktokDmsForLives(liveIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (liveIds.length === 0) return out;
  const channels = await linkedChannels();
  if (channels.length === 0) return out;
  const accounts = [...new Set(channels.map((c) => c.accountId!))];

  const targets = await db
    .select({ id: tiktokLiveSessions.id, startedAt: tiktokLiveSessions.startedAt })
    .from(tiktokLiveSessions)
    .where(and(inArray(tiktokLiveSessions.id, liveIds), inArray(tiktokLiveSessions.accountId, accounts)));
  const starts = targets.filter((t) => t.startedAt).map((t) => t.startedAt!.getTime());
  if (starts.length === 0) return out;
  const DAY = 86_400_000;
  const lives = await db
    .select({
      id: tiktokLiveSessions.id,
      accountId: tiktokLiveSessions.accountId,
      startedAt: tiktokLiveSessions.startedAt,
      endedAt: tiktokLiveSessions.endedAt,
      durationSeconds: tiktokLiveSessions.durationSeconds,
    })
    .from(tiktokLiveSessions)
    .where(
      and(
        inArray(tiktokLiveSessions.accountId, accounts),
        gte(tiktokLiveSessions.startedAt, new Date(Math.min(...starts) - DAY)),
        lte(tiktokLiveSessions.startedAt, new Date(Math.max(...starts) + DAY))
      )
    );
  const windows = liveWindows(
    lives.filter((l) => l.startedAt).map((l) => ({ ...l, startedAt: l.startedAt!, durationSeconds: l.durationSeconds ?? 0 }))
  );
  const wanted = new Set(targets.map((t) => t.id));
  const span = [...windows.entries()].filter(([id]) => wanted.has(id)).map(([, w]) => w);
  if (span.length === 0) return out;

  const contacts = await db
    .select({
      connectionId: tiktokDmContacts.connectionId,
      channelId: tiktokDmContacts.channelId,
      firstMessageAt: tiktokDmContacts.firstMessageAt,
    })
    .from(tiktokDmContacts)
    .where(
      and(
        gte(tiktokDmContacts.firstMessageAt, new Date(Math.min(...span.map((w) => w.start)))),
        lt(tiktokDmContacts.firstMessageAt, new Date(Math.max(...span.map((w) => w.closes))))
      )
    );
  for (const [id, w] of windows) {
    if (!wanted.has(id)) continue;
    const mine = channels.filter((c) => c.accountId === w.accountId);
    // The channel wasn't connected while this live's window was open.
    if (!mine.some((c) => c.firstSeenAt.getTime() <= w.closes)) continue;
    const n = contacts.filter(
      (c) =>
        mine.some((ch) => ch.connectionId === c.connectionId && ch.channelId === c.channelId) &&
        c.firstMessageAt.getTime() >= w.start &&
        c.firstMessageAt.getTime() < w.closes
    ).length;
    out.set(id, n);
  }
  return out;
}

export type DmChannelRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  channelId: string;
  label: string | null;
  accountId: string | null;
  handle: string | null;
  lastSeenAt: Date;
  dmsToday: number;
};

/** Every TikTok DM channel seen, for Integrations. */
export async function tiktokDmChannelList(now = new Date()): Promise<DmChannelRow[]> {
  const rows = await db
    .select({
      id: tiktokDmChannels.id,
      connectionId: tiktokDmChannels.connectionId,
      connectionName: watiConnections.name,
      channelId: tiktokDmChannels.channelId,
      label: tiktokDmChannels.label,
      accountId: tiktokDmChannels.accountId,
      handle: tiktokAccounts.handle,
      lastSeenAt: tiktokDmChannels.lastSeenAt,
    })
    .from(tiktokDmChannels)
    .innerJoin(watiConnections, eq(watiConnections.id, tiktokDmChannels.connectionId))
    .leftJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokDmChannels.accountId))
    .orderBy(desc(tiktokDmChannels.lastSeenAt));
  if (rows.length === 0) return [];
  const today = chatDay(now);
  const counts = await db
    .select({
      connectionId: tiktokDmContacts.connectionId,
      channelId: tiktokDmContacts.channelId,
      n: sql<number>`count(distinct ${tiktokDmDays.contactId})::int`,
    })
    .from(tiktokDmDays)
    .innerJoin(tiktokDmContacts, eq(tiktokDmContacts.id, tiktokDmDays.contactId))
    .where(eq(tiktokDmDays.day, today))
    .groupBy(tiktokDmContacts.connectionId, tiktokDmContacts.channelId);
  return rows.map((r) => ({
    ...r,
    dmsToday: counts.find((c) => c.connectionId === r.connectionId && c.channelId === r.channelId)?.n ?? 0,
  }));
}

export type DmChatRow = {
  contactId: string;
  day: string;
  lastAt: Date;
  name: string | null;
  senderId: string;
  handle: string | null;
  connectionName: string;
  isNew: boolean;
  firstMessageText: string | null;
  latestMessageText: string | null;
  latestMessageAt: Date | null;
  latestMessageFrom: string | null;
  firstReplyAt: Date | null;
  firstMessageAt: Date;
  chatUrl: string | null;
};

/**
 * TikTok DM chats per day for the Chats page: one row per user per day they
 * wrote, newest first. `accountId` limits to one handle's channels.
 */
export async function tiktokDmChats(f: {
  fromDay: string;
  toDay: string;
  accountId?: string;
  connIds?: string[];
  only?: "new" | "returning" | "waiting";
  q?: string;
}): Promise<DmChatRow[]> {
  let channels = await db
    .select({
      connectionId: tiktokDmChannels.connectionId,
      channelId: tiktokDmChannels.channelId,
      accountId: tiktokDmChannels.accountId,
      handle: tiktokAccounts.handle,
    })
    .from(tiktokDmChannels)
    .leftJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokDmChannels.accountId));
  if (f.accountId) channels = channels.filter((c) => c.accountId === f.accountId);
  if (f.connIds?.length) channels = channels.filter((c) => f.connIds!.includes(c.connectionId));
  if (channels.length === 0) return [];

  const conns = new Map(
    (await db.select({ id: watiConnections.id, name: watiConnections.name, apiEndpoint: watiConnections.apiEndpoint }).from(watiConnections)).map(
      (c) => [c.id, c]
    )
  );
  const q = (f.q ?? "").trim().toLowerCase();
  const days = await db
    .select({
      contactId: tiktokDmDays.contactId,
      day: tiktokDmDays.day,
      lastAt: tiktokDmDays.lastAt,
      c: tiktokDmContacts,
    })
    .from(tiktokDmDays)
    .innerJoin(tiktokDmContacts, eq(tiktokDmContacts.id, tiktokDmDays.contactId))
    .where(
      and(
        gte(tiktokDmDays.day, f.fromDay),
        lte(tiktokDmDays.day, f.toDay),
        inArray(tiktokDmContacts.connectionId, [...new Set(channels.map((c) => c.connectionId))]),
        q.length >= 2 ? sql`lower(coalesce(${tiktokDmContacts.name}, '')) like ${`%${q}%`}` : undefined
      )
    )
    .orderBy(desc(tiktokDmDays.lastAt))
    .limit(1000);

  const rows: DmChatRow[] = [];
  for (const d of days) {
    const ch = channels.find((x) => x.connectionId === d.c.connectionId && x.channelId === d.c.channelId);
    if (!ch) continue;
    const isNew = chatDay(d.c.firstMessageAt) === d.day;
    const waiting = d.c.latestMessageFrom === "customer";
    if (f.only === "new" && !isNew) continue;
    if (f.only === "returning" && isNew) continue;
    if (f.only === "waiting" && !waiting) continue;
    const conn = conns.get(d.c.connectionId);
    rows.push({
      contactId: d.contactId,
      day: d.day,
      lastAt: d.lastAt,
      name: d.c.name,
      senderId: d.c.senderId,
      handle: ch.handle,
      connectionName: conn?.name ?? "WATI",
      isNew,
      firstMessageText: d.c.firstMessageText,
      latestMessageText: d.c.latestMessageText,
      latestMessageAt: d.c.latestMessageAt,
      latestMessageFrom: d.c.latestMessageFrom,
      firstReplyAt: d.c.firstReplyAt,
      firstMessageAt: d.c.firstMessageAt,
      chatUrl: watiChatUrl(conn?.apiEndpoint ?? null, d.c.watiConversationId),
    });
  }
  return rows;
}

/** Link (or unlink) a TikTok DM channel to a handle. Admin-only caller. */
export async function linkTikTokDmChannel(channelRowId: string, accountId: string | null): Promise<boolean> {
  if (accountId) {
    const [a] = await db.select({ id: tiktokAccounts.id }).from(tiktokAccounts).where(eq(tiktokAccounts.id, accountId)).limit(1);
    if (!a) return false;
  }
  const r = await db
    .update(tiktokDmChannels)
    .set({ accountId, updatedAt: new Date() })
    .where(eq(tiktokDmChannels.id, channelRowId))
    .returning({ id: tiktokDmChannels.id });
  return r.length > 0;
}
