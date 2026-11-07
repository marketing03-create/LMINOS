/**
 * The WhatsApp log: one row per customer, with the facts behind every WhatsApp
 * number on the Dashboard — when they first wrote, which WATI account, which
 * live they were counted for (or why not), and how fast CS replied. SERVER-ONLY.
 *
 * Built from the SAME rules as the numbers it explains, so a click from the
 * Dashboard lands on exactly that many rows:
 *   - reply status: trackedRows + "first reply at/after first message"
 *     (reply-speed.ts), period by `first_message_at` like replySpeedFor;
 *   - the live: attributeContacts over the first-EVER contact (attribution.ts),
 *     like waLeadsForLives, with a live's rows windowed exactly as it does.
 *
 * Rows carry the customer's full phone number: this is an admin-only page
 * (requireAdminPage) and admins asked to see and search every number.
 */
import { and, desc, eq, gte, inArray, like, lt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  tiktokAccounts,
  tiktokLiveSessions,
  tiktokWaLinks,
  watiConnections,
  whatsappChatDays,
  whatsappContacts,
} from "@/db/schema";
import type { DateRange } from "@/lib/date-range";
import { AFTER_HOURS, attributeContacts } from "./attribution";
import { firstEverContactIn } from "./leads";
import { chatDay } from "./chats";
import { watiChatUrl } from "./payload";
import { mytDay, trackedRows } from "./reply-speed";

const DAY = 86_400_000;
const LIMIT = 500;

export type LogStatus = "all" | "tracked" | "replied" | "waiting" | "untracked";

export type LogFilter = {
  range: DateRange;
  /** A TikTok handle: narrows to the WATI account it is linked to (as the Dashboard does). */
  accountId?: string;
  /** WATI connection ids. */
  connIds?: string[];
  /** Malaysia day, YYYY-MM-DD (the Dashboard's "By day" rows). */
  day?: string;
  /** A live: only the customers counted for it (its WhatsApp PM). */
  liveId?: string;
  status?: LogStatus;
  /** Digits from the customer's phone, e.g. the last four. */
  q?: string;
};

export type LogRow = {
  id: string;
  name: string | null;
  /** Full number, digits (60123456789). Admin-only page. */
  phone: string;
  phoneLast4: string;
  connectionName: string;
  /** This customer's chat in WATI Team Inbox; null until TT Stars has its id. */
  chatUrl: string | null;
  /**
   * The chat's first message and who sent it — CS can open a chat (e.g. a
   * broadcast). Falls back to the customer's first message seen.
   */
  opening: { text: string | null; from: MessageFrom };
  /** The chat's newest message and who sent it; null until one is known. */
  latest: { text: string | null; at: Date; from: MessageFrom } | null;
  firstMessageAt: Date;
  firstMessageText: string | null;
  /** Set when WATI's history shows an earlier first message: a returning customer. */
  firstContactAt: Date | null;
  reply:
    | { kind: "replied"; at: Date; minutes: number; by: string | null }
    | { kind: "waiting" }
    | { kind: "untracked" };
  counted:
    | { kind: "live"; liveId: string; handle: string; startedAt: Date }
    | { kind: "none"; reason: "no-handle" | "returning" | "outside" };
};

export type MessageFrom = "customer" | "cs";
const asFrom = (v: string | null): MessageFrom => (v === "cs" ? "cs" : "customer");

export type LogResult = {
  rows: LogRow[];
  /** Rows matched before the display limit. */
  total: number;
  truncated: boolean;
  summary: { customers: number; replied: number; waiting: number; untracked: number; counted: number };
  /** Reply-status counts before the status filter, for the status tabs. */
  statusCounts: { all: number; replied: number; waiting: number; untracked: number };
  connections: { id: string; name: string }[];
  live: { id: string; handle: string; startedAt: Date } | null;
};

export async function whatsappLog(f: LogFilter): Promise<LogResult> {
  let connections = await db
    .select({
      id: watiConnections.id,
      name: watiConnections.name,
      repliesSeenAt: watiConnections.repliesSeenAt,
      apiEndpoint: watiConnections.apiEndpoint,
    })
    .from(watiConnections)
    .orderBy(watiConnections.createdAt);
  const allConnections = connections.map((c) => ({ id: c.id, name: c.name }));
  if (f.accountId) {
    // Every WATI account the handle is linked to (it can have several).
    const links = await db.query.tiktokWaLinks.findMany({
      where: eq(tiktokWaLinks.accountId, f.accountId),
      columns: { connectionId: true },
    });
    const mine = new Set(links.map((l) => l.connectionId));
    connections = connections.filter((c) => mine.has(c.id));
  }
  if (f.connIds?.length) connections = connections.filter((c) => f.connIds!.includes(c.id));

  // A live's customers are windowed the way waLeadsForLives windows them.
  let range = f.range;
  let live: LogResult["live"] = null;
  if (f.liveId) {
    const [l] = await db
      .select({ id: tiktokLiveSessions.id, handle: tiktokAccounts.handle, startedAt: tiktokLiveSessions.startedAt })
      .from(tiktokLiveSessions)
      .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
      .where(eq(tiktokLiveSessions.id, f.liveId))
      .limit(1);
    if (!l?.startedAt) return empty(allConnections);
    live = { id: l.id, handle: l.handle, startedAt: l.startedAt };
    range = {
      start: l.startedAt,
      end: new Date(l.startedAt.getTime() + DAY + AFTER_HOURS * 3_600_000),
    };
  }
  if (connections.length === 0) return { ...empty(allConnections), live };

  const digits = (f.q ?? "").replace(/\D/g, "");
  const contacts = await db
    .select(CONTACT_COLUMNS)
    .from(whatsappContacts)
    .where(
      and(
        inArray(whatsappContacts.connectionId, connections.map((c) => c.id)),
        // A live's customers by first-EVER contact (as waLeadsForLives counts
        // them); a period by first-seen message (as the reply numbers do).
        live ? firstEverContactIn(range.start, range.end) : gte(whatsappContacts.firstMessageAt, range.start),
        live ? undefined : lt(whatsappContacts.firstMessageAt, range.end),
        digits.length >= 3 ? like(whatsappContacts.phone, `%${digits}%`) : undefined
      )
    )
    .orderBy(desc(whatsappContacts.firstMessageAt));

  const inDay = f.day ? contacts.filter((c) => mytDay(c.firstMessageAt) === f.day) : contacts;
  let rows = await toRows(inDay, connections);

  if (live) rows = rows.filter((r) => r.counted.kind === "live" && r.counted.liveId === live!.id);
  // Before the status filter, so the status tabs keep their counts while one is picked.
  const statusCounts = {
    all: rows.length,
    replied: rows.filter((r) => r.reply.kind === "replied").length,
    waiting: rows.filter((r) => r.reply.kind === "waiting").length,
    untracked: rows.filter((r) => r.reply.kind === "untracked").length,
  };
  const status = f.status ?? "all";
  if (status === "tracked") rows = rows.filter((r) => r.reply.kind !== "untracked");
  else if (status !== "all") rows = rows.filter((r) => r.reply.kind === status);

  const summary = {
    customers: rows.length,
    replied: rows.filter((r) => r.reply.kind === "replied").length,
    waiting: rows.filter((r) => r.reply.kind === "waiting").length,
    untracked: rows.filter((r) => r.reply.kind === "untracked").length,
    counted: rows.filter((r) => r.counted.kind === "live").length,
  };
  return {
    rows: rows.slice(0, LIMIT),
    total: rows.length,
    truncated: rows.length > LIMIT,
    summary,
    statusCounts,
    connections: allConnections,
    live,
  };
}

const CONTACT_COLUMNS = {
  id: whatsappContacts.id,
  connectionId: whatsappContacts.connectionId,
  channelPhone: whatsappContacts.channelPhone,
  name: whatsappContacts.name,
  phone: whatsappContacts.phone,
  firstMessageAt: whatsappContacts.firstMessageAt,
  firstContactAt: whatsappContacts.firstContactAt,
  firstMessageText: whatsappContacts.firstMessageText,
  firstReplyAt: whatsappContacts.firstReplyAt,
  firstReplyBy: whatsappContacts.firstReplyBy,
  watiConversationId: whatsappContacts.watiConversationId,
  openingMessageText: whatsappContacts.openingMessageText,
  openingMessageFrom: whatsappContacts.openingMessageFrom,
  latestMessageText: whatsappContacts.latestMessageText,
  latestMessageAt: whatsappContacts.latestMessageAt,
  latestMessageFrom: whatsappContacts.latestMessageFrom,
};
type ContactRow = {
  [K in keyof typeof CONTACT_COLUMNS]: (typeof CONTACT_COLUMNS)[K]["_"]["notNull"] extends true
    ? (typeof CONTACT_COLUMNS)[K]["_"]["data"]
    : (typeof CONTACT_COLUMNS)[K]["_"]["data"] | null;
};
type Conn = { id: string; name: string; repliesSeenAt: Date | null; apiEndpoint: string | null };

/** One LogRow per contact: reply status, the live it counts for, messages. */
async function toRows(inDay: ContactRow[], connections: Conn[]): Promise<LogRow[]> {
  const tracked = new Set(trackedRows(inDay, connections).map((r) => r.id));
  const counted = await attribution(inDay);
  const connName = new Map(connections.map((c) => [c.id, c.name]));
  const connEndpoint = new Map(connections.map((c) => [c.id, c.apiEndpoint]));

  return inDay.map((c) => {
    const replied = c.firstReplyAt && c.firstReplyAt >= c.firstMessageAt;
    const returning =
      c.firstContactAt && c.firstContactAt.getTime() < c.firstMessageAt.getTime() ? c.firstContactAt : null;
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      phoneLast4: c.phone.slice(-4),
      connectionName: connName.get(c.connectionId) ?? "WATI",
      chatUrl: watiChatUrl(connEndpoint.get(c.connectionId) ?? null, c.watiConversationId),
      opening: c.openingMessageFrom
        ? { text: c.openingMessageText, from: asFrom(c.openingMessageFrom) }
        : { text: c.firstMessageText, from: "customer" },
      latest: c.latestMessageAt
        ? { text: c.latestMessageText, at: c.latestMessageAt, from: asFrom(c.latestMessageFrom) }
        : null,
      firstMessageAt: c.firstMessageAt,
      firstMessageText: c.firstMessageText,
      firstContactAt: returning,
      reply: !tracked.has(c.id)
        ? { kind: "untracked" }
        : replied
          ? {
              kind: "replied",
              at: c.firstReplyAt!,
              minutes: (c.firstReplyAt!.getTime() - c.firstMessageAt.getTime()) / 60_000,
              by: c.firstReplyBy,
            }
          : { kind: "waiting" },
      counted: counted.get(c.id) ?? { kind: "none", reason: returning ? "returning" : "outside" },
    } satisfies LogRow;
  });
}

/** A day a customer wrote, with the customer's row — the Chats view. */
export type ChatRow = LogRow & {
  chat: {
    day: string;
    /** Their last message that day. */
    at: Date;
    /** The business number they wrote to. */
    number: string | null;
    /** First-ever contact was that day. */
    isNew: boolean;
    /** CS's newest message is after their last message that day. */
    answered: boolean;
  };
};

export type ChatsResult = {
  rows: ChatRow[];
  total: number;
  truncated: boolean;
  summary: { chats: number; newChats: number; returning: number; waiting: number };
  /** Chats and new chats per business number (before the `only` filter). */
  perNumber: { number: string | null; chats: number; newChats: number }[];
  connections: { id: string; name: string }[];
};

/**
 * The Chats view: every day each customer wrote, per number — what WATI's
 * Team Inbox shows as that day's chats (a returning customer writing today is
 * a chat today). Same filters as the log (period, account, handle, number
 * digits); `day` narrows to one Malaysia day.
 */
export async function whatsappChats(
  f: Omit<LogFilter, "liveId" | "status"> & { only?: "new" | "returning" | "waiting" }
): Promise<ChatsResult> {
  let connections: Conn[] = await db
    .select({
      id: watiConnections.id,
      name: watiConnections.name,
      repliesSeenAt: watiConnections.repliesSeenAt,
      apiEndpoint: watiConnections.apiEndpoint,
    })
    .from(watiConnections)
    .orderBy(watiConnections.createdAt);
  const allConnections = connections.map((c) => ({ id: c.id, name: c.name }));
  if (f.accountId) {
    const links = await db.query.tiktokWaLinks.findMany({
      where: eq(tiktokWaLinks.accountId, f.accountId),
      columns: { connectionId: true },
    });
    const mine = new Set(links.map((l) => l.connectionId));
    connections = connections.filter((c) => mine.has(c.id));
  }
  if (f.connIds?.length) connections = connections.filter((c) => f.connIds!.includes(c.id));
  const none = {
    rows: [],
    total: 0,
    truncated: false,
    summary: { chats: 0, newChats: 0, returning: 0, waiting: 0 },
    perNumber: [],
    connections: allConnections,
  };
  if (connections.length === 0) return none;

  const fromDay = f.day ?? chatDay(f.range.start);
  const toDay = f.day ?? chatDay(new Date(f.range.end.getTime() - 1));
  const digits = (f.q ?? "").replace(/\D/g, "");
  const days = await db
    .select({
      contactId: whatsappChatDays.contactId,
      day: whatsappChatDays.day,
      number: whatsappChatDays.channelPhone,
      lastAt: whatsappChatDays.lastAt,
    })
    .from(whatsappChatDays)
    .innerJoin(whatsappContacts, eq(whatsappContacts.id, whatsappChatDays.contactId))
    .where(
      and(
        inArray(whatsappContacts.connectionId, connections.map((c) => c.id)),
        gte(whatsappChatDays.day, fromDay),
        lte(whatsappChatDays.day, toDay),
        digits.length >= 3 ? like(whatsappContacts.phone, `%${digits}%`) : undefined
      )
    )
    .orderBy(desc(whatsappChatDays.lastAt));
  if (days.length === 0) return none;

  const ids = [...new Set(days.map((d) => d.contactId))];
  const contacts = await db.select(CONTACT_COLUMNS).from(whatsappContacts).where(inArray(whatsappContacts.id, ids));
  const byId = new Map((await toRows(contacts, connections)).map((r) => [r.id, r]));
  const firstEver = new Map(contacts.map((c) => [c.id, chatDay(c.firstContactAt ?? c.firstMessageAt)]));

  let rows: ChatRow[] = days.flatMap((d) => {
    const r = byId.get(d.contactId);
    if (!r) return [];
    return [
      {
        ...r,
        chat: {
          day: d.day,
          at: d.lastAt,
          number: d.number,
          isNew: firstEver.get(d.contactId) === d.day,
          answered: !!r.latest && r.latest.from === "cs" && r.latest.at >= d.lastAt,
        },
      },
    ];
  });
  const summary = {
    chats: rows.length,
    newChats: rows.filter((r) => r.chat.isNew).length,
    returning: rows.filter((r) => !r.chat.isNew).length,
    waiting: rows.filter((r) => !r.chat.answered).length,
  };
  const numbers = new Map<string | null, { number: string | null; chats: number; newChats: number }>();
  for (const r of rows) {
    const n = numbers.get(r.chat.number) ?? { number: r.chat.number, chats: 0, newChats: 0 };
    n.chats += 1;
    if (r.chat.isNew) n.newChats += 1;
    numbers.set(r.chat.number, n);
  }
  const perNumber = [...numbers.values()].sort((a, b) => b.chats - a.chats);
  if (f.only === "new") rows = rows.filter((r) => r.chat.isNew);
  else if (f.only === "returning") rows = rows.filter((r) => !r.chat.isNew);
  else if (f.only === "waiting") rows = rows.filter((r) => !r.chat.answered);
  return {
    rows: rows.slice(0, LIMIT),
    total: rows.length,
    truncated: rows.length > LIMIT,
    summary,
    perNumber,
    connections: allConnections,
  };
}

function empty(connections: { id: string; name: string }[]): LogResult {
  return {
    rows: [],
    total: 0,
    truncated: false,
    summary: { customers: 0, replied: 0, waiting: 0, untracked: 0, counted: 0 },
    statusCounts: { all: 0, replied: 0, waiting: 0, untracked: 0 },
    connections,
    live: null,
  };
}

type ContactForAttribution = {
  id: string;
  connectionId: string;
  channelPhone: string | null;
  firstMessageAt: Date;
  firstContactAt: Date | null;
  firstMessageText: string | null;
};

/** contact id → the live it counts for, or why none (attribution.ts rules). */
async function attribution(
  contacts: ContactForAttribution[]
): Promise<Map<string, LogRow["counted"]>> {
  const out = new Map<string, LogRow["counted"]>();
  if (contacts.length === 0) return out;

  const links = await db
    .select({
      accountId: tiktokWaLinks.accountId,
      connectionId: tiktokWaLinks.connectionId,
      channelPhone: tiktokWaLinks.channelPhone,
      code: tiktokWaLinks.code,
    })
    .from(tiktokWaLinks);

  // Counted by the first-EVER contact, like waLeadsForLives.
  const firsts = contacts.map((c) => ({ ...c, firstMessageAt: c.firstContactAt ?? c.firstMessageAt }));
  const times = firsts.map((c) => c.firstMessageAt.getTime());
  const lives = links.length
    ? await db
        .select({
          id: tiktokLiveSessions.id,
          accountId: tiktokLiveSessions.accountId,
          handle: tiktokAccounts.handle,
          startedAt: tiktokLiveSessions.startedAt,
          endedAt: tiktokLiveSessions.endedAt,
          durationSeconds: tiktokLiveSessions.durationSeconds,
        })
        .from(tiktokLiveSessions)
        .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokLiveSessions.accountId))
        .where(
          and(
            inArray(tiktokLiveSessions.accountId, links.map((l) => l.accountId)),
            gte(tiktokLiveSessions.startedAt, new Date(Math.min(...times) - DAY)),
            lte(tiktokLiveSessions.startedAt, new Date(Math.max(...times) + DAY))
          )
        )
    : [];
  const withStart = lives.filter((l) => l.startedAt).map((l) => ({ ...l, startedAt: l.startedAt! }));
  const assigned = attributeContacts(withStart, links, firsts);
  const byId = new Map(withStart.map((l) => [l.id, l]));

  for (const c of contacts) {
    const liveId = assigned.get(c.id);
    const l = liveId ? byId.get(liveId) : undefined;
    if (l) {
      out.set(c.id, { kind: "live", liveId: l.id, handle: l.handle, startedAt: l.startedAt });
      continue;
    }
    const linked = links.some(
      (k) =>
        k.connectionId === c.connectionId &&
        (!k.channelPhone || !c.channelPhone || k.channelPhone === c.channelPhone)
    );
    const returning = c.firstContactAt && c.firstContactAt.getTime() < c.firstMessageAt.getTime();
    out.set(c.id, {
      kind: "none",
      reason: !linked ? "no-handle" : returning ? "returning" : "outside",
    });
  }
  return out;
}
