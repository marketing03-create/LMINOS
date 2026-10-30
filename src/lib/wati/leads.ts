/**
 * WhatsApp leads per live — the queries around lib/wati/attribution.ts.
 * SERVER-ONLY.
 *
 * Callers wrap these in try/catch: until migration 0037 is applied the tables
 * they read don't exist, and a page must still render without the numbers.
 */
import { and, desc, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  tiktokAccounts,
  tiktokLiveSessions,
  tiktokWaLinks,
  watiConnections,
  whatsappContacts,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import {
  AFTER_HOURS,
  attributeContacts,
  liveWindows,
  summarize,
  type LiveWaSummary,
} from "./attribution";

const DAY = 86_400_000;

export type WaContactRow = {
  id: string;
  name: string | null;
  phone: string;
  firstMessageAt: Date;
  firstMessageText: string | null;
  firstReplyAt: Date | null;
  firstReplyBy: string | null;
};

/**
 * "full": the WATI account was connected before the live started, so the count
 * is complete. "partial": connected while the live's window was still open —
 * the count is only what arrived after that. "none": the window had closed.
 */
export type Tracking = "full" | "partial" | "none";

export type LiveWa = LiveWaSummary & { contacts: WaContactRow[]; tracking: Tracking };

/**
 * WhatsApp leads for the given lives. Lives of handles not linked to a WATI
 * account are absent from the result (no number, rather than a false 0).
 * See `Tracking` for why a live's count may be partial or meaningless.
 */
export async function waLeadsForLives(liveIds: string[]): Promise<Map<string, LiveWa>> {
  const out = new Map<string, LiveWa>();
  if (liveIds.length === 0) return out;

  const links = await db
    .select({
      accountId: tiktokWaLinks.accountId,
      connectionId: tiktokWaLinks.connectionId,
      channelPhone: tiktokWaLinks.channelPhone,
      code: tiktokWaLinks.code,
      connectedAt: watiConnections.createdAt,
      repliesSeenAt: watiConnections.repliesSeenAt,
    })
    .from(tiktokWaLinks)
    .innerJoin(watiConnections, eq(watiConnections.id, tiktokWaLinks.connectionId));
  if (links.length === 0) return out;
  const linkedAccounts = links.map((l) => l.accountId);

  const targets = await db
    .select({ id: tiktokLiveSessions.id, accountId: tiktokLiveSessions.accountId, startedAt: tiktokLiveSessions.startedAt })
    .from(tiktokLiveSessions)
    .where(and(inArray(tiktokLiveSessions.id, liveIds), inArray(tiktokLiveSessions.accountId, linkedAccounts)));
  const starts = targets.filter((t) => t.startedAt).map((t) => t.startedAt!.getTime());
  if (starts.length === 0) return out;
  const from = new Date(Math.min(...starts));
  const to = new Date(Math.max(...starts));

  // Neighbouring lives too: the next live on a handle closes the previous
  // one's window, and another handle on the same number may claim a lead.
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
        inArray(tiktokLiveSessions.accountId, linkedAccounts),
        gte(tiktokLiveSessions.startedAt, new Date(from.getTime() - DAY)),
        lte(tiktokLiveSessions.startedAt, new Date(to.getTime() + DAY))
      )
    );

  const connections = [...new Set(links.map((l) => l.connectionId))];
  const contacts = await db
    .select({
      id: whatsappContacts.id,
      connectionId: whatsappContacts.connectionId,
      channelPhone: whatsappContacts.channelPhone,
      name: whatsappContacts.name,
      phone: whatsappContacts.phone,
      firstMessageAt: whatsappContacts.firstMessageAt,
      firstMessageText: whatsappContacts.firstMessageText,
      firstReplyAt: whatsappContacts.firstReplyAt,
      firstReplyBy: whatsappContacts.firstReplyBy,
    })
    .from(whatsappContacts)
    .where(
      and(
        inArray(whatsappContacts.connectionId, connections),
        gte(whatsappContacts.firstMessageAt, from),
        lt(whatsappContacts.firstMessageAt, new Date(to.getTime() + DAY + AFTER_HOURS * 3_600_000))
      )
    )
    .orderBy(desc(whatsappContacts.firstMessageAt));

  const assigned = attributeContacts(
    lives.filter((l) => l.startedAt).map((l) => ({ ...l, startedAt: l.startedAt! })),
    links,
    contacts
  );

  const windows = liveWindows(lives.filter((l) => l.startedAt).map((l) => ({ ...l, startedAt: l.startedAt! })));
  const linkByAccount = new Map(links.map((l) => [l.accountId, l]));
  for (const t of targets) {
    if (!t.startedAt) continue;
    const link = linkByAccount.get(t.accountId)!;
    const mine = contacts.filter((c) => assigned.get(c.id) === t.id);
    out.set(t.id, {
      ...summarize(mine),
      contacts: mine.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        firstMessageAt: c.firstMessageAt,
        firstMessageText: c.firstMessageText,
        firstReplyAt: c.firstReplyAt,
        firstReplyBy: c.firstReplyBy,
      })),
      tracking:
        t.startedAt >= link.connectedAt
          ? "full"
          : (windows.get(t.id)?.closes ?? 0) > link.connectedAt.getTime()
            ? "partial"
            : "none",
    });
  }
  return out;
}

/**
 * The 10am job: for handles with auto-fill on, write the WhatsApp count into
 * Total Leads of recent lives that still have none. Only once the live's
 * window has closed (the count is final), only for lives that started after
 * the WATI account was connected, and never over a number someone typed.
 */
export async function autoFillTotalLeads(now = new Date()): Promise<number> {
  const links = await db
    .select({ accountId: tiktokWaLinks.accountId, handle: tiktokAccounts.handle })
    .from(tiktokWaLinks)
    .innerJoin(tiktokAccounts, eq(tiktokAccounts.id, tiktokWaLinks.accountId))
    .where(eq(tiktokWaLinks.autoFillTotalLeads, true));
  if (links.length === 0) return 0;

  const recent = await db
    .select({
      id: tiktokLiveSessions.id,
      accountId: tiktokLiveSessions.accountId,
      startedAt: tiktokLiveSessions.startedAt,
      endedAt: tiktokLiveSessions.endedAt,
      durationSeconds: tiktokLiveSessions.durationSeconds,
      totalLeads: tiktokLiveSessions.totalLeads,
    })
    .from(tiktokLiveSessions)
    .where(
      and(
        inArray(tiktokLiveSessions.accountId, links.map((l) => l.accountId)),
        gte(tiktokLiveSessions.startedAt, new Date(now.getTime() - 8 * DAY))
      )
    );
  const lives = recent.filter((l) => l.startedAt).map((l) => ({ ...l, startedAt: l.startedAt! }));
  const windows = liveWindows(lives);
  const due = lives.filter(
    (l) =>
      l.totalLeads === null &&
      l.startedAt.getTime() >= now.getTime() - 7 * DAY &&
      (windows.get(l.id)?.closes ?? Infinity) <= now.getTime()
  );
  if (due.length === 0) return 0;

  const wa = await waLeadsForLives(due.map((l) => l.id));
  let filled = 0;
  for (const l of due) {
    const r = wa.get(l.id);
    if (!r || r.tracking !== "full") continue;
    const updated = await db
      .update(tiktokLiveSessions)
      .set({ totalLeads: r.waLeads, updatedAt: now })
      .where(and(eq(tiktokLiveSessions.id, l.id), isNull(tiktokLiveSessions.totalLeads)))
      .returning({ id: tiktokLiveSessions.id });
    if (updated.length === 0) continue;
    filled += 1;
    await writeAudit({
      actorUserId: null,
      eventType: "tiktok.total_leads_autofilled",
      entityType: "tiktok_live_session",
      entityId: l.id,
      before: { total_leads: null },
      after: { total_leads: r.waLeads, source: "whatsapp" },
    });
  }
  return filled;
}

/**
 * Session id → WhatsApp leads, for the sessions table. Undefined (no column at
 * all) when none of these lives was tracked, or anything fails — the table must
 * render either way.
 */
export async function waLeadCounts(liveIds: string[]): Promise<Record<string, number> | undefined> {
  try {
    const wa = await waLeadsForLives(liveIds);
    const counts: Record<string, number> = {};
    for (const [id, r] of wa) if (r.tracking === "full") counts[id] = r.waLeads;
    return Object.keys(counts).length > 0 ? counts : undefined;
  } catch (err) {
    console.error("[wati] lead counts failed:", err);
    return undefined;
  }
}
