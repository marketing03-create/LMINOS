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
 * Phones never leave this module whole: rows carry the last four digits only.
 * The full number is revealed one at a time through an audited admin route.
 */
import { and, desc, eq, gte, inArray, like, lt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  tiktokAccounts,
  tiktokLiveSessions,
  tiktokWaLinks,
  watiConnections,
  whatsappContacts,
} from "@/db/schema";
import type { DateRange } from "@/lib/date-range";
import { AFTER_HOURS, attributeContacts } from "./attribution";
import { firstEverContactIn } from "./leads";
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
  phoneLast4: string;
  connectionName: string;
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

export type LogResult = {
  rows: LogRow[];
  /** Rows matched before the display limit. */
  total: number;
  truncated: boolean;
  summary: { customers: number; replied: number; waiting: number; untracked: number; counted: number };
  connections: { id: string; name: string }[];
  live: { id: string; handle: string; startedAt: Date } | null;
};

export async function whatsappLog(f: LogFilter): Promise<LogResult> {
  let connections = await db
    .select({ id: watiConnections.id, name: watiConnections.name, repliesSeenAt: watiConnections.repliesSeenAt })
    .from(watiConnections)
    .orderBy(watiConnections.createdAt);
  const allConnections = connections.map((c) => ({ id: c.id, name: c.name }));
  if (f.accountId) {
    const link = await db.query.tiktokWaLinks.findFirst({
      where: eq(tiktokWaLinks.accountId, f.accountId),
      columns: { connectionId: true },
    });
    connections = connections.filter((c) => c.id === link?.connectionId);
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
    .select({
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
    })
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
  const tracked = new Set(trackedRows(inDay, connections).map((r) => r.id));
  const counted = await attribution(inDay);
  const connName = new Map(connections.map((c) => [c.id, c.name]));

  let rows: LogRow[] = inDay.map((c) => {
    const replied = c.firstReplyAt && c.firstReplyAt >= c.firstMessageAt;
    const returning =
      c.firstContactAt && c.firstContactAt.getTime() < c.firstMessageAt.getTime() ? c.firstContactAt : null;
    return {
      id: c.id,
      name: c.name,
      phoneLast4: c.phone.slice(-4),
      connectionName: connName.get(c.connectionId) ?? "WATI",
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
    };
  });

  if (live) rows = rows.filter((r) => r.counted.kind === "live" && r.counted.liveId === live!.id);
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
    connections: allConnections,
    live,
  };
}

function empty(connections: { id: string; name: string }[]): LogResult {
  return {
    rows: [],
    total: 0,
    truncated: false,
    summary: { customers: 0, replied: 0, waiting: 0, untracked: 0, counted: 0 },
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
