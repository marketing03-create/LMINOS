/**
 * Which live a WhatsApp lead came from. Pure — the queries load rows, this
 * decides — so the rule can be pinned down in tests.
 *
 * The rule, in order:
 *  1. A first message containing a handle's code ("Hi AIN") belongs to that
 *     handle, whatever number it arrived on.
 *  2. Otherwise it belongs to the handles linked to the WATI account (and
 *     number) it arrived on.
 *  3. Of those handles' lives, it goes to the latest one that had started by
 *     the time of the first message and whose window was still open.
 *
 * A live's window runs from its start until AFTER_HOURS after it ends, but
 * closes early when the same handle goes live again — the 12pm live's leads
 * stop when the 2pm live starts. A lead outside every window is counted
 * nowhere rather than guessed at.
 */

export const AFTER_HOURS = 3;

export type LiveWindowInput = {
  id: string;
  accountId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number;
};

export type WaLink = {
  accountId: string;
  connectionId: string;
  channelPhone: string | null;
  code: string | null;
};

export type ContactInput = {
  id: string;
  connectionId: string;
  channelPhone: string | null;
  firstMessageAt: Date;
  firstMessageText: string | null;
};

const HOUR = 3_600_000;

/** Codes are 2–12 letters/digits, stored upper-case. Null if not valid. */
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toUpperCase();
  return /^[A-Z0-9]{2,12}$/.test(c) ? c : null;
}

/** True when `code` appears in `text` as a whole word, any case. */
export function textHasCode(text: string | null, code: string): boolean {
  if (!text) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${code}([^A-Za-z0-9]|$)`, "i").test(text);
}

function liveEnd(l: LiveWindowInput): Date {
  if (l.endedAt) return l.endedAt;
  return new Date(l.startedAt.getTime() + Math.max(l.durationSeconds * 1000, HOUR));
}

/** [start, closesAt) for every live, closing early at the handle's next live. */
export function liveWindows(
  lives: LiveWindowInput[],
  afterHours = AFTER_HOURS
): Map<string, { accountId: string; start: number; closes: number }> {
  const byAccount = new Map<string, LiveWindowInput[]>();
  for (const l of lives) {
    const list = byAccount.get(l.accountId) ?? [];
    list.push(l);
    byAccount.set(l.accountId, list);
  }
  const out = new Map<string, { accountId: string; start: number; closes: number }>();
  for (const list of byAccount.values()) {
    list.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    list.forEach((l, i) => {
      const start = l.startedAt.getTime();
      let closes = liveEnd(l).getTime() + afterHours * HOUR;
      const next = list[i + 1];
      if (next) closes = Math.min(closes, next.startedAt.getTime());
      out.set(l.id, { accountId: l.accountId, start, closes: Math.max(closes, start) });
    });
  }
  return out;
}

/** contact id → live id (or null when it fits no live). */
export function attributeContacts(
  lives: LiveWindowInput[],
  links: WaLink[],
  contacts: ContactInput[],
  afterHours = AFTER_HOURS
): Map<string, string | null> {
  const windows = liveWindows(lives, afterHours);
  const coded = links.filter((l): l is WaLink & { code: string } => !!l.code);
  const result = new Map<string, string | null>();

  for (const c of contacts) {
    const byCode = coded.filter((l) => textHasCode(c.firstMessageText, l.code));
    const accounts = new Set(
      (byCode.length > 0
        ? byCode
        : links.filter(
            (l) =>
              l.connectionId === c.connectionId &&
              (!l.channelPhone || !c.channelPhone || l.channelPhone === c.channelPhone)
          )
      ).map((l) => l.accountId)
    );

    const t = c.firstMessageAt.getTime();
    let best: { id: string; start: number } | null = null;
    for (const [id, w] of windows) {
      if (!accounts.has(w.accountId)) continue;
      if (t < w.start || t >= w.closes) continue;
      if (!best || w.start > best.start) best = { id, start: w.start };
    }
    result.set(c.id, best?.id ?? null);
  }
  return result;
}

export type ReplyFacts = { firstMessageAt: Date; firstReplyAt: Date | null };

export type LiveWaSummary = {
  waLeads: number;
  replied: number;
  waiting: number;
  /** Median minutes from a lead's first message to the first human reply. */
  medianReplyMinutes: number | null;
};

export function summarize(contacts: ReplyFacts[]): LiveWaSummary {
  const delays = contacts
    .filter((c) => c.firstReplyAt)
    .map((c) => (c.firstReplyAt!.getTime() - c.firstMessageAt.getTime()) / 60_000)
    .sort((a, b) => a - b);
  const mid = Math.floor(delays.length / 2);
  const median =
    delays.length === 0
      ? null
      : delays.length % 2
        ? delays[mid]
        : (delays[mid - 1] + delays[mid]) / 2;
  return {
    waLeads: contacts.length,
    replied: delays.length,
    waiting: contacts.length - delays.length,
    medianReplyMinutes: median === null ? null : Math.round(median * 10) / 10,
  };
}
