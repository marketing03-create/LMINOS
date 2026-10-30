/**
 * Reading one chat's history from WATI's API (GET …/getMessages/<phone>).
 * Pure — the sync fetches, this decides — so the rules are pinned in tests.
 *
 * Two answers per lead:
 *  - `firstContactAt`: the customer's earliest message we can see. TT Stars
 *    only hears messages from the day it was connected, so a customer who has
 *    chatted for weeks looks brand new; their real first contact moves them out
 *    of today's lead count, the same way CS counts each person once, ever.
 *  - `firstReply`: our first message, that a person sent, after the message TT
 *    Stars first saw — not a template, a broadcast, a bot, or an instant
 *    automatic greeting. Measured from what they just wrote, not from their
 *    first-ever contact: "how fast did CS answer" is about today's question
 *    (from the first-ever message, a returning customer reads 82,000 minutes).
 *
 * WATI lists newest first. When more pages exist, the earliest customer
 * message seen is only an upper bound on their real first contact — still the
 * right thing to move `firstMessageAt` back to, since it is older than ours.
 */
import { HUMAN_MIN_DELAY_MS } from "./payload";

export type WatiMessage = {
  at: Date;
  owner: boolean;
  /** "message" for chat messages; WATI also lists ticket events. */
  eventType: string | null;
  template: boolean;
  broadcast: boolean;
  bot: boolean;
  operator: string | null;
};

export type HistoryResult = {
  firstContactAt: Date;
  firstReply: { at: Date; by: string | null } | null;
};

function time(m: Record<string, unknown>): Date | null {
  const created = typeof m.created === "string" ? new Date(m.created) : null;
  if (created && !Number.isNaN(created.getTime())) return created;
  const ts = Number(m.timestamp);
  return Number.isFinite(ts) && ts > 0 ? new Date(ts < 1e12 ? ts * 1000 : ts) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** WATI's getMessages body → our message list. Unknown shapes give []. */
export function parseMessages(body: unknown): { items: WatiMessage[]; complete: boolean } {
  const b = body as { messages?: { items?: unknown; hasNextPage?: unknown } } | null;
  const raw = Array.isArray(b?.messages?.items)
    ? (b!.messages!.items as Record<string, unknown>[])
    : [];
  const items: WatiMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const at = time(m);
    if (!at) continue;
    items.push({
      at,
      owner: m.owner === true,
      eventType: str(m.eventType),
      template: !!str(m.templateId),
      broadcast: !!str(m.broadcastLinkId),
      bot: !!str(m.botType),
      operator: str(m.operatorName) ?? str(m.operatorEmail),
    });
  }
  return { items, complete: b?.messages?.hasNextPage !== true };
}

export function analyzeHistory(items: WatiMessage[], ourFirstMessageAt: Date): HistoryResult {
  const chat = items.filter((m) => (m.eventType ?? "message") === "message");
  const customer = chat.filter((m) => !m.owner).map((m) => m.at.getTime());
  const earliestSeen = customer.length ? Math.min(...customer) : null;
  const first =
    earliestSeen !== null && earliestSeen < ourFirstMessageAt.getTime()
      ? new Date(earliestSeen)
      : ourFirstMessageAt;

  const replies = chat
    .filter((m) => m.owner && !m.template && !m.broadcast && !m.bot)
    .filter((m) => {
      const delay = m.at.getTime() - ourFirstMessageAt.getTime();
      if (delay <= 0) return false;
      return m.operator ? true : delay >= HUMAN_MIN_DELAY_MS;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    firstContactAt: first,
    firstReply: replies[0] ? { at: replies[0].at, by: replies[0].operator } : null,
  };
}
