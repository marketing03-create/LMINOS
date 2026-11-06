/**
 * Add a WhatsApp customer TT Stars never received, from WATI's chat history.
 * SERVER-ONLY. Used by the cross-check (heals a webhook WATI skipped) and the
 * history backfill script, so both add customers exactly the same way.
 *
 * Only ever adds: an existing customer row is left alone (its chat days are
 * still filled). Never raises a missed-lead alert for history.
 */
import { db } from "@/db/client";
import { whatsappContacts } from "@/db/schema";
import { fetchChat } from "./api";
import { recordChatDaysFromHistory } from "./chats";
import { analyzeHistory, chatEnds, parseMessages, type WatiMessage } from "./history";

const MAX_PAGES = 6; // 300 messages

/** A chat's messages, newest pages first, back to `since` (or its start). */
export async function readChat(
  endpoint: string,
  token: string,
  phone: string,
  number: string,
  since: Date
): Promise<{ items: WatiMessage[]; complete: boolean; conversationId: string | null }> {
  const items: WatiMessage[] = [];
  let complete = false;
  let conversationId: string | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await fetchChat(endpoint, token, phone, number, page);
    if (!body) break;
    const r = parseMessages(body);
    items.push(...r.items);
    conversationId ??= r.conversationId;
    if (r.complete) {
      complete = true;
      break;
    }
    if (r.items.length && Math.min(...r.items.map((m) => m.at.getTime())) < since.getTime()) break;
  }
  return { items, complete, conversationId };
}

/**
 * The customer's messages since `since` on `number`, saved: their row (added
 * if TT Stars didn't have it) and their chat days. Returns what happened, or
 * null when they didn't write on that number since `since`.
 */
export async function addFromHistory(input: {
  connectionId: string;
  phone: string;
  name: string | null;
  number: string;
  chat: { items: WatiMessage[]; complete: boolean; conversationId: string | null };
  since: Date;
  /** The row TT Stars already has for this phone on this account, if any. */
  existingId?: string | null;
}): Promise<{ added: boolean; contactId: string; chatDays: number } | null> {
  const { items, complete, conversationId } = input.chat;
  const inbound = items
    .filter((m) => !m.owner && (m.eventType ?? "message") === "message")
    .map((m) => m.at)
    .sort((a, b) => +a - +b);
  const recent = inbound.filter((t) => t >= input.since);
  if (recent.length === 0) return null;

  let contactId = input.existingId ?? null;
  let added = false;
  if (!contactId) {
    const firstSeen = recent[0];
    const ends = chatEnds(items, complete);
    const analysis = analyzeHistory(items, firstSeen);
    const firstEver = inbound[0];
    const [ins] = await db
      .insert(whatsappContacts)
      .values({
        connectionId: input.connectionId,
        phone: input.phone,
        name: input.name,
        channelPhone: input.number,
        firstMessageAt: firstSeen,
        lastMessageAt: recent[recent.length - 1],
        firstMessageText: items.find((m) => !m.owner && m.at.getTime() === firstSeen.getTime())?.text ?? null,
        firstContactAt: firstEver < firstSeen ? firstEver : null,
        firstReplyAt: analysis.firstReply?.at ?? null,
        firstReplyBy: analysis.firstReply?.by ?? null,
        watiConversationId: conversationId,
        latestMessageText: ends.latest?.text ?? null,
        latestMessageAt: ends.latest?.at ?? null,
        latestMessageFrom: ends.latest?.from ?? null,
        latestCheckedAt: new Date(),
        openingMessageText: ends.opening?.text ?? null,
        openingMessageAt: ends.opening?.at ?? null,
        openingMessageFrom: ends.opening?.from ?? null,
        missedAlertedAt: new Date(),
      })
      .onConflictDoNothing({ target: [whatsappContacts.connectionId, whatsappContacts.phone] })
      .returning({ id: whatsappContacts.id });
    if (ins) {
      contactId = ins.id;
      added = true;
    } else {
      // The webhook saved them a moment ago — find that row and just fill days.
      const row = await db.query.whatsappContacts.findFirst({
        where: (w, { and, eq }) => and(eq(w.connectionId, input.connectionId), eq(w.phone, input.phone)),
        columns: { id: true },
      });
      if (!row) return null;
      contactId = row.id;
    }
  }
  const chatDays = await recordChatDaysFromHistory(contactId, input.number, items, input.since);
  return { added, contactId, chatDays };
}
