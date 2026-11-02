/**
 * Daily cross-check: did TT Stars receive every new WhatsApp customer WATI
 * has? SERVER-ONLY. Rules in crosscheck-core.ts.
 *
 * For one account and one day:
 *  1. WATI's contacts created that day (getContacts?createdDate=…).
 *  2. Ones TT Stars already has (same phone, same account) → found.
 *  3. The rest: their chat on each linked number is read (getMessages). A
 *     customer message after TT Stars was connected → MISSING; anything else
 *     → not a customer chat. At most MAX_CHATS chats per run; any left over
 *     are reported as unchecked rather than guessed.
 * The result replaces that account's row for that day in wati_daily_checks.
 *
 * Never logs WATI's error text or a phone number.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  tiktokWaLinks,
  watiConnections,
  watiDailyChecks,
  whatsappContacts,
  type CrossCheckMissing,
} from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import { fetchChat } from "./api";
import { classifyChat, watiDateParam } from "./crosscheck-core";
import { parseMessages } from "./history";

const MAX_PAGES = 30;
const MAX_CHATS = 80;

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

  // The numbers TikTok leads arrive on: linked ones, plus any seen on this account.
  const numbers = new Set<string>();
  for (const r of await db
    .select({ p: tiktokWaLinks.channelPhone })
    .from(tiktokWaLinks)
    .where(eq(tiktokWaLinks.connectionId, connectionId)))
    if (r.p) numbers.add(r.p);
  for (const r of await db
    .selectDistinct({ p: whatsappContacts.channelPhone })
    .from(whatsappContacts)
    .where(and(eq(whatsappContacts.connectionId, connectionId), isNotNull(whatsappContacts.channelPhone))))
    if (r.p) numbers.add(r.p);
  if (numbers.size === 0) {
    return save({ ...base, error: "No WhatsApp number linked to this account yet." });
  }

  // 1. WATI's new contacts that day.
  const created: { phone: string; name: string | null }[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        pageSize: "100",
        pageNumber: String(page),
        createdDate: watiDateParam(day),
      });
      const res = await fetch(`${conn.apiEndpoint}/api/v1/getContacts?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (!res.ok) {
        return save({ ...base, error: res.status === 401 || res.status === 403 ? "WATI refused the token." : `WATI answered ${res.status}.` });
      }
      const body = (await res.json().catch(() => null)) as {
        contact_list?: { wAid?: unknown; fullName?: unknown; firstName?: unknown }[];
        link?: { nextPage?: unknown };
      } | null;
      for (const c of body?.contact_list ?? []) {
        const phone = typeof c.wAid === "string" ? c.wAid.replace(/\D/g, "") : "";
        if (!phone) continue;
        const name = typeof c.fullName === "string" && c.fullName.trim() ? c.fullName.trim() : null;
        // WATI puts the number in the name when it has none.
        created.push({ phone, name: name && name.replace(/\D/g, "") !== phone ? name : null });
      }
      if (!body?.link?.nextPage) break;
    }
  } catch {
    return save({ ...base, error: "Couldn't reach WATI." });
  }

  // 2. Which of them TT Stars has.
  const phones = [...new Set(created.map((c) => c.phone))];
  const have = new Set(
    phones.length
      ? (
          await db
            .select({ p: whatsappContacts.phone })
            .from(whatsappContacts)
            .where(and(eq(whatsappContacts.connectionId, connectionId), inArray(whatsappContacts.phone, phones)))
        ).map((r) => r.p)
      : []
  );
  const candidates = created.filter((c, i) => !have.has(c.phone) && created.findIndex((x) => x.phone === c.phone) === i);
  const found = phones.length - candidates.length;

  // 3. Read the chats of the rest.
  const missing: CrossCheckMissing[] = [];
  let notCustomers = 0;
  let calls = 0;
  let unchecked = 0;
  for (const c of candidates) {
    if (calls >= MAX_CHATS) {
      unchecked++;
      continue;
    }
    let verdict: ReturnType<typeof classifyChat> = { kind: "not-customer" };
    let on = "";
    for (const n of numbers) {
      if (calls >= MAX_CHATS) break;
      calls++;
      const body = await fetchChat(conn.apiEndpoint, token, c.phone, n);
      if (!body) continue;
      verdict = classifyChat(parseMessages(body).items, conn.createdAt);
      on = n;
      if (verdict.kind === "customer") break;
    }
    if (verdict.kind === "customer") {
      missing.push({ last4: c.phone.slice(-4), name: c.name, at: verdict.firstInboundAt.toISOString(), number: on.slice(-4) });
    } else {
      notCustomers++;
    }
  }

  return save({
    ...base,
    watiCustomers: found + missing.length,
    found,
    missing,
    notCustomers,
    unchecked,
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
