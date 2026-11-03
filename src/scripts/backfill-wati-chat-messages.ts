/**
 * One-off: fill each WhatsApp chat's opening and newest message (text + who
 * sent it) for the WhatsApp log, by reading its history from WATI. Pages back
 * up to MAX_PAGES so the opening message is the real first one; a longer chat
 * keeps a blank opening (the log then shows the customer's first message).
 * Writes only the latest_* / opening_* / latest_checked_at columns — safe to re-run.
 *
 *   npx tsx --env-file=.env.local src/scripts/backfill-wati-chat-messages.ts
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { watiConnections, whatsappContacts } from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { fetchChat } from "@/lib/wati/api";
import { chatEnds, parseMessages, type WatiMessage } from "@/lib/wati/history";
import { endsToSet } from "@/lib/wati/sync";

const CONCURRENCY = 3;
const MAX_PAGES = 10;

async function main() {
  const now = new Date();
  const conns = await db.select().from(watiConnections);
  for (const c of conns) {
    if (!c.apiEndpoint || !c.apiTokenEnc) {
      console.log(`${c.name}: no API set up — skipped`);
      continue;
    }
    const token = decryptToken(c.apiTokenEnc);
    const chats = await db
      .select({ id: whatsappContacts.id, phone: whatsappContacts.phone, channelPhone: whatsappContacts.channelPhone })
      .from(whatsappContacts)
      .where(eq(whatsappContacts.connectionId, c.id));

    let done = 0;
    let withOpening = 0;
    let failed = 0;
    for (let i = 0; i < chats.length; i += CONCURRENCY) {
      await Promise.all(
        chats.slice(i, i + CONCURRENCY).map(async (chat) => {
          const items: WatiMessage[] = [];
          let complete = false;
          for (let page = 1; page <= MAX_PAGES; page++) {
            const body = await fetchChat(c.apiEndpoint!, token, chat.phone, chat.channelPhone, page);
            if (!body) break;
            const r = parseMessages(body);
            items.push(...r.items);
            if (r.complete) {
              complete = true;
              break;
            }
          }
          if (items.length === 0) {
            failed += 1;
            return;
          }
          const ends = chatEnds(items, complete);
          await db.update(whatsappContacts).set(endsToSet(ends, now)).where(eq(whatsappContacts.id, chat.id));
          done += 1;
          if (ends.opening) withOpening += 1;
        })
      );
    }
    console.log(
      `${c.name}: ${chats.length} chats → ${done} filled (${withOpening} with the opening message), ${failed} unreadable`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
