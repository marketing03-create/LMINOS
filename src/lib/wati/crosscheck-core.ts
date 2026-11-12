/**
 * The daily cross-check's rules. Pure, so they're pinned in tests; the queries
 * and WATI calls live in crosscheck.ts.
 *
 * WATI lists the contacts created on a day. Most aren't TikTok leads: CS saved
 * or messaged them first, or they wrote to another of the account's numbers.
 * A contact only counts as a customer TT Stars should have when their chat on
 * a LINKED number shows them writing to us after TT Stars was connected —
 * before that, TT Stars couldn't have heard them.
 */
import type { WatiMessage } from "./history";

export type ChatVerdict =
  | { kind: "customer"; firstInboundAt: Date }
  | { kind: "not-customer" };

export function classifyChat(items: WatiMessage[], connectedAt: Date): ChatVerdict {
  const inbound = items
    .filter((m) => !m.owner && (m.eventType ?? "message") === "message")
    .map((m) => m.at.getTime())
    .filter((t) => t >= connectedAt.getTime());
  return inbound.length
    ? { kind: "customer", firstInboundAt: new Date(Math.min(...inbound)) }
    : { kind: "not-customer" };
}

/**
 * The customer's first message inside [start, end) — a chat that day — or null.
 * Our own messages and ticket events don't count.
 */
export function customerWroteBetween(items: WatiMessage[], start: number, end: number): Date | null {
  const times = items
    .filter((m) => !m.owner && (m.eventType ?? "message") === "message")
    .map((m) => m.at.getTime())
    .filter((t) => t >= start && t < end);
  return times.length ? new Date(Math.min(...times)) : null;
}

/** A Malaysia day's [start, end) in UTC milliseconds. */
export function mytDayBounds(day: string): { start: number; end: number } {
  const start = Date.parse(`${day}T00:00:00+08:00`);
  return { start, end: start + 86_400_000 };
}

/** YYYY-MM-DD → WATI's createdDate filter, MM-DD-YYYY. */
export function watiDateParam(day: string): string {
  const [y, m, d] = day.split("-");
  return `${m}-${d}-${y}`;
}

/** Yesterday in Malaysia, YYYY-MM-DD. */
export function mytYesterday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
}

// ── The "WhatsApp has gone quiet" alert (quiet.ts) ──

export const QUIET_HOURS = 3;
/** Only accounts this busy count as "normally active": customers in the last week. */
const ACTIVE_WEEKLY = 5;

/** True between 10am and 10pm Malaysia time. */
export function inWorkingHours(now: Date): boolean {
  const h = (now.getUTCHours() + 8) % 24;
  return h >= 10 && h < 22;
}

/** Pure: should this account be flagged? */
export function isQuiet(lastCustomerAt: Date | null, weekCustomers: number, now: Date): boolean {
  if (!lastCustomerAt || weekCustomers < ACTIVE_WEEKLY) return false;
  return now.getTime() - lastCustomerAt.getTime() >= QUIET_HOURS * 3_600_000;
}

/** No webhook call for this long = the account's webhook has gone silent. */
export const WEBHOOK_QUIET_MIN = 60;

/**
 * Pure: has WATI stopped calling this account's webhook? An account that was
 * never connected (no event yet) isn't "quiet" — there's nothing to catch up.
 */
export function webhookSilent(lastEventAt: Date | null, now: Date): boolean {
  return !!lastEventAt && now.getTime() - lastEventAt.getTime() >= WEBHOOK_QUIET_MIN * 60_000;
}

// ── Mass-sync contacts (WhatsApp Business App contacts copied into WATI) ──

/** More sync-looking contacts than this touched in one hour = a mass sync. */
export const SYNC_BURST = 200;

/**
 * A contact as WATI's WhatsApp Business App sync writes it: source "WhatsApp
 * Business App" and not VALID (never confirmed by a chat over the API). Real
 * customers can share that source, so this alone never skips anyone.
 */
export const looksSynced = (source: unknown, status: unknown) =>
  source === "WhatsApp Business App" && status !== "VALID";

/** "2026-11-05 16:00" — the Malaysia hour of an instant. */
export const mytHour = (t: number) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 13).replace("T", " ") + ":00";

export type SyncCandidate = { phone: string; name: string | null; synced: boolean; lastUpdated: number };

/**
 * Split WATI contacts into ones worth reading and mass-synced ones to skip.
 * Skipped = sync-looking AND last touched in an hour when more than `burst`
 * sync-looking contacts were touched (WATI copies — and later re-copies —
 * thousands at once). Anyone who wrote since keeps a later lastUpdated, and
 * every other contact is read as normal.
 */
export function splitMassSync(contacts: SyncCandidate[], burst = SYNC_BURST) {
  const perHour = new Map<string, number>();
  for (const c of contacts) {
    if (!c.synced) continue;
    const h = mytHour(c.lastUpdated);
    perHour.set(h, (perHour.get(h) ?? 0) + 1);
  }
  const burstHours = new Set([...perHour].filter(([, n]) => n > burst).map(([h]) => h));
  const keep: SyncCandidate[] = [];
  const skipped: SyncCandidate[] = [];
  for (const c of contacts) (c.synced && burstHours.has(mytHour(c.lastUpdated)) ? skipped : keep).push(c);
  const bursts = [...burstHours].sort().map((hour) => ({ hour, count: perHour.get(hour) ?? 0 }));
  return { keep, skipped, bursts };
}
