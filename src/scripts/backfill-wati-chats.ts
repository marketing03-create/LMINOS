/**
 * One-off, re-runnable: make TT Stars' WhatsApp chats complete since SINCE on
 * the numbers linked to a TikTok handle, from WATI's history.
 *
 *  - Customers TT Stars has: their chat days (whatsapp_chat_days) since SINCE.
 *  - Customers TT Stars never received (a webhook that wasn't set up yet):
 *    added to whatsapp_contacts — first message seen since SINCE, real first
 *    contact if earlier, first CS reply, opening/newest message, chat id — plus
 *    their chat days.
 *
 * Which WATI contacts are read: all of them, except bulk imports — contacts
 * created on a day with more than BURST creations and never touched after that
 * day (an imported broadcast list, not chats). Numbers that never received a
 * single message in TT Stars (e.g. one Meta hasn't approved) are skipped.
 *
 *   npx tsx --env-file=.env.local src/scripts/backfill-wati-chats.ts --plan      (counts only)
 *   npx tsx --env-file=.env.local src/scripts/backfill-wati-chats.ts --dry-run
 *   npx tsx --env-file=.env.local src/scripts/backfill-wati-chats.ts
 *
 * Only adds or fills rows; never deletes or overwrites a field already set.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokWaLinks, watiConnections, whatsappContacts } from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { fetchChat } from "@/lib/wati/api";
import { recordChatDaysFromHistory } from "@/lib/wati/chats";
import { analyzeHistory, chatEnds, parseMessages, type WatiMessage } from "@/lib/wati/history";

const SINCE = new Date("2026-10-25T16:00:00Z"); // 26 Oct 00:00 MYT
const BURST = 500;
const MAX_READ = 3000;
const MAX_PAGES = 6; // 300 messages per chat
const CONCURRENCY = 4;
const DRY = process.argv.includes("--dry-run");

type WatiContact = { phone: string; name: string | null; createdDay: string; lastUpdated: number };

async function allContacts(endpoint: string, token: string): Promise<WatiContact[]> {
  const out: WatiContact[] = [];
  for (let p = 1; p <= 400; p++) {
    const r = await fetch(`${endpoint}/api/v1/getContacts?pageSize=100&pageNumber=${p}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list: Record<string, unknown>[] = ((await r.json().catch(() => null)) as { contact_list?: Record<string, unknown>[] } | null)?.contact_list ?? [];
    for (const c of list) {
      const phone = typeof c.wAid === "string" ? c.wAid.replace(/\D/g, "") : "";
      if (!phone) continue;
      const name = typeof c.fullName === "string" && c.fullName.trim() ? c.fullName.trim() : null;
      out.push({
        phone,
        name: name && name.replace(/\D/g, "") !== phone ? name.slice(0, 120) : null,
        createdDay: typeof c.created === "string" ? c.created : "",
        lastUpdated: typeof c.lastUpdated === "string" ? Date.parse(c.lastUpdated) : 0,
      });
    }
    if (list.length < 100) break;
  }
  return out;
}

/** "Nov-05-2026" → "2026-11-05"; lastUpdated → its Malaysia day. */
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
const isoDay = (watiDay: string) => {
  const m = /^([A-Za-z]{3})-(\d{2})-(\d{4})$/.exec(watiDay);
  return m ? `${m[3]}-${MONTHS[m[1]]}-${m[2]}` : "";
};
const mytDay = (t: number) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);

/** A chat's messages back to SINCE (or its start). */
async function history(endpoint: string, token: string, phone: string, number: string) {
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
    if (r.items.length && Math.min(...r.items.map((m) => m.at.getTime())) < SINCE.getTime()) break;
  }
  return { items, complete, conversationId };
}

async function main() {
  console.log(DRY ? "DRY RUN — nothing is written" : "Writing");
  for (const conn of await db.select().from(watiConnections)) {
    if (!conn.apiEndpoint || !conn.apiTokenEnc) continue;
    const token = decryptToken(conn.apiTokenEnc).replace(/^Bearer\s+/i, "");

    // Linked numbers that have ever received a customer message in TT Stars.
    const linked = (await db.select({ p: tiktokWaLinks.channelPhone }).from(tiktokWaLinks).where(eq(tiktokWaLinks.connectionId, conn.id)))
      .map((l) => l.p)
      .filter((p): p is string => !!p);
    const live = linked.length
      ? (await db
          .selectDistinct({ p: whatsappContacts.channelPhone })
          .from(whatsappContacts)
          .where(and(eq(whatsappContacts.connectionId, conn.id), inArray(whatsappContacts.channelPhone, linked), isNotNull(whatsappContacts.channelPhone))))
          .map((r) => r.p!)
      : [];
    const skipped = linked.filter((n) => !live.includes(n));
    console.log(`\n== ${conn.name}: numbers ${live.join(", ") || "none"}${skipped.length ? ` (skipped, never received: ${skipped.join(", ")})` : ""}`);
    if (live.length === 0) continue;

    const known = new Map(
      (await db.select().from(whatsappContacts).where(eq(whatsappContacts.connectionId, conn.id))).map((r) => [r.phone, r])
    );
    const contacts = await allContacts(conn.apiEndpoint, token);
    const perDay = new Map<string, number>();
    for (const c of contacts) perDay.set(c.createdDay, (perDay.get(c.createdDay) ?? 0) + 1);
    let candidates = contacts.filter((c) => {
      if (known.has(c.phone)) return true;
      const burst = (perDay.get(c.createdDay) ?? 0) > BURST;
      return !(burst && mytDay(c.lastUpdated) === isoDay(c.createdDay));
    });
    // Too many to read one by one (old imports touched again later): keep the
    // known customers and the contacts WATI shows active since SINCE.
    if (candidates.length > MAX_READ) {
      candidates = candidates.filter((c) => known.has(c.phone) || c.lastUpdated >= SINCE.getTime());
      console.log(`more than ${MAX_READ} to read — narrowed to known customers + contacts active since ${SINCE.toISOString()}`);
    }
    console.log(`WATI contacts ${contacts.length}, read ${candidates.length} (bulk-import contacts skipped: ${contacts.length - candidates.length})`);
    if (process.argv.includes("--plan")) {
      const bursts = [...perDay].filter(([, n]) => n > BURST).map(([d, n]) => `${d}: ${n}`);
      console.log(`bulk-import days: ${bursts.join(", ") || "none"} | already in TT Stars: ${known.size}`);
      continue;
    }

    let added = 0;
    let filled = 0;
    let chatDays = 0;
    let reads = 0;
    let next = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < candidates.length) {
          const c = candidates[next++];
          for (const number of live) {
            reads++;
            const h = await history(conn.apiEndpoint!, token, c.phone, number);
            const inbound = h.items
              .filter((m) => !m.owner && (m.eventType ?? "message") === "message")
              .map((m) => m.at)
              .sort((a, b) => +a - +b);
            const recent = inbound.filter((t) => t >= SINCE);
            if (recent.length === 0) continue;

            let row = known.get(c.phone);
            if (!row) {
              const firstSeen = recent[0];
              const ends = chatEnds(h.items, h.complete);
              const analysis = analyzeHistory(h.items, firstSeen);
              const firstEver = inbound[0];
              const firstText = h.items.find((m) => !m.owner && m.at.getTime() === firstSeen.getTime())?.text ?? null;
              if (DRY) {
                added++;
                break;
              }
              const [ins] = await db
                .insert(whatsappContacts)
                .values({
                  connectionId: conn.id,
                  phone: c.phone,
                  name: c.name,
                  channelPhone: number,
                  firstMessageAt: firstSeen,
                  lastMessageAt: recent[recent.length - 1],
                  firstMessageText: firstText,
                  firstContactAt: firstEver < firstSeen ? firstEver : null,
                  firstReplyAt: analysis.firstReply?.at ?? null,
                  firstReplyBy: analysis.firstReply?.by ?? null,
                  watiConversationId: h.conversationId,
                  latestMessageText: ends.latest?.text ?? null,
                  latestMessageAt: ends.latest?.at ?? null,
                  latestMessageFrom: ends.latest?.from ?? null,
                  latestCheckedAt: new Date(),
                  openingMessageText: ends.opening?.text ?? null,
                  openingMessageAt: ends.opening?.at ?? null,
                  openingMessageFrom: ends.opening?.from ?? null,
                  // Imported, not alerted live — never raise a missed-lead alert for history.
                  missedAlertedAt: new Date(),
                })
                .onConflictDoNothing({ target: [whatsappContacts.connectionId, whatsappContacts.phone] })
                .returning();
              if (!ins) break;
              row = ins;
              known.set(c.phone, ins);
              added++;
            } else filled++;
            if (!DRY) chatDays += await recordChatDaysFromHistory(row.id, number, h.items, SINCE);
            break;
          }
        }
      })
    );
    console.log(`chat reads ${reads} | customers added ${added} | existing customers filled ${filled} | chat days recorded ${chatDays}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
