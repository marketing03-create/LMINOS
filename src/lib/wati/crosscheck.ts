/**
 * Daily cross-check: did TT Stars get every WhatsApp CHAT WATI had that day,
 * on the numbers that matter? SERVER-ONLY. Rules in crosscheck-core.ts.
 *
 * A chat = a customer who wrote at least once that Malaysia day, on a number —
 * the same thing WATI's Team Inbox counts. For one account and one day:
 *  1. The numbers: the ones linked to a TikTok handle (Lead routing). Other
 *     numbers on the same WATI account are deliberately ignored.
 *  2. TT Stars' chats that day on those numbers (whatsapp_chat_days) → found.
 *  3. WATI's contacts active since that day (getContacts lists newest activity
 *     first) that TT Stars has no chat for: their chat on each linked number
 *     is read; a customer message that day → MISSING, else not a chat that day.
 *     Bulk imports can touch thousands of contacts at once, so at most
 *     MAX_PAGES pages and MAX_CHATS chat reads; the rest are reported as
 *     unchecked rather than guessed.
 * The result replaces that account's row for that day in wati_daily_checks.
 *
 * Known limit: WATI doesn't always move a contact's lastUpdated when they
 * write, so a chat TT Stars ALSO missed could go unseen here. The background
 * history sync (sync.ts) backs this up by filling chat days from WATI history.
 *
 * Never logs WATI's error text or a phone number.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  tiktokWaLinks,
  watiConnections,
  watiDailyChecks,
  whatsappChatDays,
  whatsappContacts,
  type CrossCheckMissing,
} from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { fetchChat } from "./api";
import { customerWroteBetween, mytDayBounds } from "./crosscheck-core";
import { parseMessages } from "./history";

const MAX_PAGES = 20; // 2,000 contacts
const MAX_CHATS = 300;
const CONCURRENCY = 4;

type Row = typeof watiDailyChecks.$inferInsert;

export async function crossCheckDay(connectionId: string, day: string): Promise<Row> {
  const base: Row = { connectionId, day, checkedAt: new Date() };
  const conn = await db.query.watiConnections.findFirst({
    where: eq(watiConnections.id, connectionId),
  });
  if (!conn) return { ...base, error: "Account not found." };
  if (!conn.apiEndpoint || !conn.apiTokenEnc) return save({ ...base, error: "No WATI API token saved." });

  let token: string;
  try {
    token = decryptToken(conn.apiTokenEnc);
  } catch {
    return save({ ...base, error: "The saved API token can't be read — enter it again." });
  }

  // 1. The numbers that matter: linked to a handle. ("Any number" links fall
  //    back to every number TT Stars has seen on this account.)
  const links = await db
    .select({ p: tiktokWaLinks.channelPhone })
    .from(tiktokWaLinks)
    .where(eq(tiktokWaLinks.connectionId, connectionId));
  const numbers = new Set(links.map((l) => l.p).filter((p): p is string => !!p));
  if (links.some((l) => !l.p)) {
    for (const r of await db
      .selectDistinct({ p: whatsappContacts.channelPhone })
      .from(whatsappContacts)
      .where(and(eq(whatsappContacts.connectionId, connectionId), isNotNull(whatsappContacts.channelPhone))))
      if (r.p) numbers.add(r.p);
  }
  if (numbers.size === 0) {
    return save({ ...base, error: "No WhatsApp number linked to this account yet." });
  }
  const { start, end } = mytDayBounds(day);

  // 2. TT Stars' chats that day on those numbers.
  const ours = await db
    .selectDistinct({ phone: whatsappContacts.phone })
    .from(whatsappChatDays)
    .innerJoin(whatsappContacts, eq(whatsappContacts.id, whatsappChatDays.contactId))
    .where(
      and(
        eq(whatsappContacts.connectionId, connectionId),
        eq(whatsappChatDays.day, day),
        inArray(whatsappChatDays.channelPhone, [...numbers])
      )
    );
  const have = new Set(ours.map((r) => r.phone));

  // 3. WATI's contacts active since that day, minus the ones TT Stars has.
  const candidates: { phone: string; name: string | null }[] = [];
  let capped = false;
  try {
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES) {
        capped = true;
        break;
      }
      const qs = new URLSearchParams({ pageSize: "100", pageNumber: String(page) });
      const res = await fetch(`${conn.apiEndpoint}/api/v1/getContacts?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (!res.ok) {
        return save({ ...base, error: res.status === 401 || res.status === 403 ? "WATI refused the token." : `WATI answered ${res.status}.` });
      }
      const body = (await res.json().catch(() => null)) as {
        contact_list?: { wAid?: unknown; fullName?: unknown; lastUpdated?: unknown }[];
      } | null;
      const list = body?.contact_list ?? [];
      let older = 0;
      for (const c of list) {
        const at = typeof c.lastUpdated === "string" ? Date.parse(c.lastUpdated) : NaN;
        if (!(at >= start)) {
          older++;
          continue;
        }
        const phone = typeof c.wAid === "string" ? c.wAid.replace(/\D/g, "") : "";
        if (!phone || have.has(phone)) continue;
        const name = typeof c.fullName === "string" && c.fullName.trim() ? c.fullName.trim() : null;
        // WATI puts the number in the name when it has none.
        candidates.push({ phone, name: name && name.replace(/\D/g, "") !== phone ? name : null });
      }
      if (list.length < 100 || older === list.length) break;
    }
  } catch {
    return save({ ...base, error: "Couldn't reach WATI." });
  }

  // 4. Read their chats on the linked numbers.
  const missing: CrossCheckMissing[] = [];
  let notCustomers = 0;
  let calls = 0;
  let unchecked = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < candidates.length) {
        const c = candidates[next++];
        if (calls >= MAX_CHATS) {
          unchecked++;
          continue;
        }
        let wrote: { at: Date; number: string } | null = null;
        for (const n of numbers) {
          calls++;
          const body = await fetchChat(conn.apiEndpoint!, token, c.phone, n);
          if (!body) continue;
          const at = customerWroteBetween(parseMessages(body).items, start, end);
          if (at) {
            wrote = { at, number: n };
            break;
          }
        }
        if (wrote) {
          missing.push({ last4: c.phone.slice(-4), name: c.name, at: wrote.at.toISOString(), number: wrote.number.slice(-4) });
        } else {
          notCustomers++;
        }
      }
    })
  );

  return save({
    ...base,
    watiCustomers: have.size + missing.length,
    found: have.size,
    missing,
    notCustomers,
    // A capped contact list means more contacts than we could look at.
    unchecked: unchecked + (capped ? 1 : 0),
    error: null,
  });
}

async function save(row: Row): Promise<Row> {
  await db
    .insert(watiDailyChecks)
    .values(row)
    .onConflictDoUpdate({
      target: [watiDailyChecks.connectionId, watiDailyChecks.day],
      set: {
        checkedAt: row.checkedAt ?? new Date(),
        watiCustomers: row.watiCustomers ?? 0,
        found: row.found ?? 0,
        missing: row.missing ?? [],
        notCustomers: row.notCustomers ?? 0,
        unchecked: row.unchecked ?? 0,
        error: row.error ?? null,
      },
    });
  return row;
}

/** Every active account, one day. Never throws; failures are stored per row. */
export async function crossCheckAll(day: string): Promise<Row[]> {
  const conns = await db
    .select({ id: watiConnections.id })
    .from(watiConnections)
    .where(eq(watiConnections.isActive, true));
  const out: Row[] = [];
  for (const c of conns) {
    try {
      out.push(await crossCheckDay(c.id, day));
    } catch (err) {
      console.error("[wati] cross-check failed:", err instanceof Error ? err.name : "error");
      out.push(await save({ connectionId: c.id, day, checkedAt: new Date(), error: "The check failed — try again." }));
    }
  }
  return out;
}
