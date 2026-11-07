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
 *     is read; a customer message that day → WATI skipped that webhook, so the
 *     chat is ADDED from WATI's history (listed with added: true), else it
 *     wasn't a chat that day.
 *     Mass syncs (WhatsApp Business App contacts copied into WATI, thousands
 *     in an hour, sometimes re-copied days later) are skipped — sync-looking
 *     and last touched in a burst hour, never chatted since — and recorded (count, hours, a sample with full numbers)
 *     so an admin can double-check them in WATI. At most MAX_PAGES pages and
 *     MAX_CHATS chat reads; the rest are reported as unchecked, not guessed.
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
  type SkippedInfo,
} from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { customerWroteBetween, mytDayBounds, looksSynced, splitMassSync, type SyncCandidate } from "./crosscheck-core";
import { addFromHistory, readChat } from "./import";
import { customerIdOf } from "./payload";

const MAX_PAGES = 400; // 40,000 contacts — room for a mass sync on the day
const MAX_CHATS = 300;
const CONCURRENCY = 4;
const PAGE_BATCH = 8; // contact pages fetched at once
const PAGE_BUDGET_MS = 150_000; // stop paging after this; the rest counts as unchecked
const SAMPLE = 200; // skipped contacts listed by number

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
  const active: SyncCandidate[] = [];
  let capped = false;
  try {
    type Page = {
      wAid?: unknown;
      fullName?: unknown;
      source?: unknown;
      contactStatus?: unknown;
      lastUpdated?: unknown;
      scopedUsers?: { bsuid?: unknown }[];
    }[];
    const fetchPage = async (page: number): Promise<Page | number> => {
      const qs = new URLSearchParams({ pageSize: "100", pageNumber: String(page) });
      const res = await fetch(`${conn.apiEndpoint}/api/v1/getContacts?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (!res.ok) return res.status;
      return (((await res.json().catch(() => null)) as { contact_list?: Page } | null)?.contact_list ?? []);
    };
    let done = false;
    const t0 = Date.now();
    for (let first = 1; !done; first += PAGE_BATCH) {
      if (first > MAX_PAGES || Date.now() - t0 > PAGE_BUDGET_MS) {
        capped = true;
        break;
      }
      const pages = await Promise.all(Array.from({ length: PAGE_BATCH }, (_, i) => fetchPage(first + i)));
      for (const list of pages) {
        if (typeof list === "number") {
          return save({ ...base, error: list === 401 || list === 403 ? "WATI refused the token." : `WATI answered ${list}.` });
        }
        let older = 0;
        for (const c of list) {
          const at = typeof c.lastUpdated === "string" ? Date.parse(c.lastUpdated) : NaN;
          if (!(at >= start)) {
            older++;
            continue;
          }
          // A username-only customer has a BSUID instead of a phone number.
          const phone = customerIdOf(c.wAid, c.scopedUsers?.[0]?.bsuid) ?? "";
          if (!phone) continue;
          const name = typeof c.fullName === "string" && c.fullName.trim() ? c.fullName.trim() : null;
          active.push({
            phone,
            // WATI puts the number in the name when it has none.
            name: name && name.replace(/\D/g, "") !== phone ? name.slice(0, 120) : null,
            synced: looksSynced(c.source, c.contactStatus),
            lastUpdated: at,
          });
        }
        if (list.length < 100 || older === list.length) {
          done = true;
          break;
        }
      }
    }
  } catch {
    return save({ ...base, error: "Couldn't reach WATI." });
  }

  // Mass-synced contacts are skipped but recorded, newest first.
  const split = splitMassSync(active);
  const candidates = split.keep.filter((c) => !have.has(c.phone));
  const skipped = split.skipped.filter((c) => !have.has(c.phone));
  const skippedInfo: SkippedInfo | null = skipped.length
    ? {
        bursts: split.bursts,
        sample: skipped
          .sort((a, b) => b.lastUpdated - a.lastUpdated)
          .slice(0, SAMPLE)
          .map((c) => ({ phone: c.phone, name: c.name, at: new Date(c.lastUpdated).toISOString() })),
      }
    : null;

  // Rows TT Stars has for these phones (a chat day may be all that's missing).
  const existingIds = new Map(
    candidates.length
      ? (
          await db
            .select({ id: whatsappContacts.id, phone: whatsappContacts.phone })
            .from(whatsappContacts)
            .where(and(eq(whatsappContacts.connectionId, connectionId), inArray(whatsappContacts.phone, candidates.map((c) => c.phone))))
        ).map((r) => [r.phone, r.id])
      : []
  );

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
        let wrote: { at: Date; number: string; chat: Awaited<ReturnType<typeof readChat>> } | null = null;
        for (const n of numbers) {
          calls++;
          const chat = await readChat(conn.apiEndpoint!, token, c.phone, n, new Date(start));
          const at = customerWroteBetween(chat.items, start, end);
          if (at) {
            wrote = { at, number: n, chat };
            break;
          }
        }
        if (!wrote) {
          notCustomers++;
          continue;
        }
        // WATI never sent this chat to TT Stars (it skips the odd webhook):
        // add it from WATI's history so the numbers match, and say so.
        const healed = await addFromHistory({
          connectionId,
          phone: c.phone,
          name: c.name,
          number: wrote.number,
          chat: wrote.chat,
          since: new Date(start),
          existingId: existingIds.get(c.phone) ?? null,
        }).catch(() => null);
        missing.push({
          last4: c.phone.slice(-4),
          name: c.name,
          at: wrote.at.toISOString(),
          number: wrote.number.slice(-4),
          added: !!healed,
        });
      }
    })
  );

  const added = missing.filter((m) => m.added).length;
  return save({
    ...base,
    watiCustomers: have.size + missing.length,
    // Chats added from WATI's history count as found — TT Stars has them now.
    found: have.size + added,
    missing,
    notCustomers,
    // A capped contact list means more contacts than we could look at.
    unchecked: unchecked + (capped ? 1 : 0),
    skipped: skipped.length,
    skippedInfo,
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
        skipped: row.skipped ?? 0,
        skippedInfo: row.skippedInfo ?? null,
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
