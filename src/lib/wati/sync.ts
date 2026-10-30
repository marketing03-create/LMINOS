/**
 * Reply times from WATI's API. SERVER-ONLY.
 *
 * WATI sends no webhook for a reply typed in Team Inbox or the WhatsApp
 * Business app (measured 2026-10-30: ~300 deliveries, not one
 * sessionMessageSent), so the webhook alone can't see CS answer. Instead, for
 * each recent lead nobody has answered yet, we read that chat's latest
 * messages from the API and keep two times (lib/wati/history.ts): the
 * customer's real first contact (`firstContactAt`, when earlier than the first
 * message we saw) and our first reply. Nothing else from the chat is stored —
 * no text, no media.
 *
 * Bounded per run: the newest MAX_PER_RUN unanswered leads from the last
 * LOOKBACK_HOURS, a few at a time. Runs from `maintainConnection` (missed.ts),
 * which the webhook triggers at most once every few minutes per account.
 */
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { watiConnections, whatsappContacts } from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { fetchChat } from "./api";
import { analyzeHistory, parseMessages } from "./history";

const LOOKBACK_HOURS = 48;
const MAX_PER_RUN = 25;
const CONCURRENCY = 3;
/** A first contact found less than this much earlier is the same message. */
const MOVE_BACK_MIN_MS = 60_000;

export type SyncResult = { checked: number; replied: number; movedBack: number };

/** Null when the account has no working API set up (or a call failed outright). */
export async function syncRepliesFromApi(
  connectionId: string,
  now = new Date()
): Promise<SyncResult | null> {
  const conn = await db.query.watiConnections.findFirst({
    where: eq(watiConnections.id, connectionId),
    columns: { apiEndpoint: true, apiTokenEnc: true },
  });
  if (!conn?.apiEndpoint || !conn.apiTokenEnc) return null;
  let token: string;
  try {
    token = decryptToken(conn.apiTokenEnc);
  } catch {
    return null;
  }

  const leads = await db
    .select({
      id: whatsappContacts.id,
      phone: whatsappContacts.phone,
      channelPhone: whatsappContacts.channelPhone,
      firstMessageAt: whatsappContacts.firstMessageAt,
    })
    .from(whatsappContacts)
    .where(
      and(
        eq(whatsappContacts.connectionId, connectionId),
        isNull(whatsappContacts.firstReplyAt),
        gte(whatsappContacts.firstMessageAt, new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000))
      )
    )
    .orderBy(desc(whatsappContacts.firstMessageAt))
    .limit(MAX_PER_RUN);

  const result: SyncResult = { checked: 0, replied: 0, movedBack: 0 };
  let anyOk = leads.length === 0;
  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    await Promise.all(
      leads.slice(i, i + CONCURRENCY).map(async (lead) => {
        const body = await fetchChat(conn.apiEndpoint!, token, lead.phone, lead.channelPhone);
        if (!body) return;
        anyOk = true;
        result.checked += 1;
        const { items } = parseMessages(body);
        if (items.length === 0) return;
        const h = analyzeHistory(items, lead.firstMessageAt);

        const set: Partial<typeof whatsappContacts.$inferInsert> = {};
        if (lead.firstMessageAt.getTime() - h.firstContactAt.getTime() > MOVE_BACK_MIN_MS) {
          // Its own column: firstMessageAt stays "first message we saw".
          set.firstContactAt = h.firstContactAt;
          result.movedBack += 1;
        }
        if (h.firstReply) {
          set.firstReplyAt = h.firstReply.at;
          set.firstReplyBy = h.firstReply.by;
          result.replied += 1;
        }
        if (Object.keys(set).length === 0) return;
        await db
          .update(whatsappContacts)
          .set({ ...set, updatedAt: now })
          .where(and(eq(whatsappContacts.id, lead.id), isNull(whatsappContacts.firstReplyAt)));
      })
    );
  }

  // The API answered: reply tracking is on for this account from now on.
  if (anyOk) {
    await db
      .update(watiConnections)
      .set({ repliesSeenAt: now })
      .where(and(eq(watiConnections.id, connectionId), isNull(watiConnections.repliesSeenAt)));
  }
  return anyOk ? result : null;
}
