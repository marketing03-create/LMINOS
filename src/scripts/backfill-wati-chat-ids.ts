/**
 * One-off: fill `whatsapp_contacts.wati_conversation_id` for customers saved
 * before TT Stars kept it, by reading each chat's latest messages from WATI
 * (every message carries the chat's id). Writes only that column, only where
 * it is still null — safe to re-run. New customers get it from the webhook.
 *
 *   npx tsx --env-file=.env.local src/scripts/backfill-wati-chat-ids.ts
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { watiConnections, whatsappContacts } from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { fetchChat } from "@/lib/wati/api";
import { parseMessages } from "@/lib/wati/history";

const CONCURRENCY = 3;

async function main() {
  const conns = await db.select().from(watiConnections);
  for (const c of conns) {
    if (!c.apiEndpoint || !c.apiTokenEnc) {
      console.log(`${c.name}: no API set up — skipped`);
      continue;
    }
    const token = decryptToken(c.apiTokenEnc);
    const todo = await db
      .select({ id: whatsappContacts.id, phone: whatsappContacts.phone, channelPhone: whatsappContacts.channelPhone })
      .from(whatsappContacts)
      .where(and(eq(whatsappContacts.connectionId, c.id), isNull(whatsappContacts.watiConversationId)));

    let filled = 0;
    let missing = 0;
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      await Promise.all(
        todo.slice(i, i + CONCURRENCY).map(async (lead) => {
          const body = await fetchChat(c.apiEndpoint!, token, lead.phone, lead.channelPhone);
          const id = body ? parseMessages(body).conversationId : null;
          if (!id) {
            missing += 1;
            return;
          }
          await db
            .update(whatsappContacts)
            .set({ watiConversationId: id })
            .where(and(eq(whatsappContacts.id, lead.id), isNull(whatsappContacts.watiConversationId)));
          filled += 1;
        })
      );
    }
    console.log(`${c.name}: ${todo.length} without a chat id → ${filled} filled, ${missing} not found`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
