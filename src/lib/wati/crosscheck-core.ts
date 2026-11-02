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
