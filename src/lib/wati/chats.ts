/**
 * Chats per day — what WATI's Team Inbox counts. SERVER-ONLY.
 *
 * A "chat" on a day = a customer who wrote at least once that Malaysia day, on
 * that number. A "new" chat = one whose first-ever contact was that day.
 * `whatsapp_contacts` keeps one row per customer, so a returning customer
 * writing today never showed up in today's numbers; `whatsapp_chat_days`
 * (written here) fixes that.
 */
import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { whatsappChatDays, whatsappContacts } from "@/db/schema";

const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST
export const chatDay = (d: Date) => new Date(d.getTime() + MYT_MS).toISOString().slice(0, 10);

/**
 * Record that a customer wrote at `at` on `channelPhone`. Idempotent — the
 * same message twice (WATI retries) or a history read of a message the
 * webhook already saw changes nothing but the first/last times.
 */
export async function recordChatDay(contactId: string, channelPhone: string | null, at: Date): Promise<void> {
  const iso = at.toISOString();
  await db
    .insert(whatsappChatDays)
    .values({ contactId, day: chatDay(at), channelPhone, firstAt: at, lastAt: at })
    .onConflictDoUpdate({
      target: [whatsappChatDays.contactId, whatsappChatDays.day, whatsappChatDays.channelPhone],
      set: {
        firstAt: sql`least(${whatsappChatDays.firstAt}, ${iso}::timestamptz)`,
        lastAt: sql`greatest(${whatsappChatDays.lastAt}, ${iso}::timestamptz)`,
        updatedAt: new Date(),
      },
    });
}

export type NumberDay = { connectionId: string; channelPhone: string | null; day: string; chats: number; newChats: number };

/**
 * Chats and new chats per WATI account, number and day, for days fromDay..toDay
 * (YYYY-MM-DD, inclusive). "New" = the customer's first-ever contact
 * (first_contact_at from WATI's history, else the first message TT Stars saw)
 * fell on that day.
 */
export async function chatsPerNumberDay(
  connectionIds: string[],
  fromDay: string,
  toDay: string
): Promise<NumberDay[]> {
  if (connectionIds.length === 0) return [];
  const rows = await db
    .select({
      connectionId: whatsappContacts.connectionId,
      channelPhone: whatsappChatDays.channelPhone,
      day: whatsappChatDays.day,
      chats: sql<number>`count(distinct ${whatsappChatDays.contactId})::int`,
      newChats: sql<number>`(count(distinct ${whatsappChatDays.contactId}) filter (where to_char(coalesce(${whatsappContacts.firstContactAt}, ${whatsappContacts.firstMessageAt}) at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') = ${whatsappChatDays.day}))::int`,
    })
    .from(whatsappChatDays)
    .innerJoin(whatsappContacts, sql`${whatsappContacts.id} = ${whatsappChatDays.contactId}`)
    .where(
      and(
        inArray(whatsappContacts.connectionId, connectionIds),
        gte(whatsappChatDays.day, fromDay),
        lte(whatsappChatDays.day, toDay)
      )
    )
    .groupBy(whatsappContacts.connectionId, whatsappChatDays.channelPhone, whatsappChatDays.day);
  return rows;
}

/**
 * Chat days from a history read (WATI's getMessages): every day since `since`
 * on which the customer wrote. Lets the background sync fill a day a webhook
 * never delivered.
 */
export async function recordChatDaysFromHistory(
  contactId: string,
  channelPhone: string | null,
  items: { at: Date; owner: boolean; eventType: string | null }[],
  since: Date
): Promise<number> {
  const byDay = new Map<string, Date[]>();
  for (const m of items) {
    if (m.owner || (m.eventType ?? "message") !== "message" || m.at < since) continue;
    const d = chatDay(m.at);
    byDay.set(d, [...(byDay.get(d) ?? []), m.at]);
  }
  for (const times of byDay.values()) {
    times.sort((a, b) => +a - +b);
    await recordChatDay(contactId, channelPhone, times[0]);
    if (times.length > 1) await recordChatDay(contactId, channelPhone, times[times.length - 1]);
  }
  return byDay.size;
}
