/**
 * Reading WATI webhook bodies. Pure — no DB, no env — so the shapes WATI sends
 * can be pinned down in tests.
 *
 * WATI's published samples (2022–2023) name the inbound event both "message"
 * and "messageReceived", and send "newContactMessageReceived" for a first-ever
 * chat. All three are a customer writing to us. Everything else (our own
 * replies, template sends, delivered/read receipts) is acknowledged and ignored
 * here. `owner: true` marks a message WE sent, whatever the event is called.
 */

const INBOUND_EVENTS = new Set([
  "message",
  "messageReceived",
  "newContactMessageReceived",
]);

/** Longest opening message kept — enough for a prefilled live/streamer code. */
const FIRST_TEXT_MAX = 500;

export type InboundMessage = {
  phone: string;
  name: string | null;
  text: string | null;
  channelPhone: string | null;
  at: Date;
  /** WATI's id for this chat (opens it in Team Inbox), when sent. */
  conversationId: string | null;
};

/**
 * Digits only, international form: "+60 12-345 6789", "60123456789" and the
 * local "0123456789" are all 60123456789. Local numbers (leading 0) are taken
 * as Malaysian. Null when what's left can't be a phone number.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `60${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** Unix seconds (string or number), unix ms, or an ISO string. */
function parseTime(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw))) {
    const n = Number(raw);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * The customer's chat in WATI's Team Inbox, e.g.
 * https://live.wati.io/10181090/teamInbox/6ae86eb70888921616992f42 — the
 * number is the account's tenant id, the last part of its API endpoint
 * (https://live-mt-server.wati.io/10181090). Null when either is unknown.
 */
export function watiChatUrl(apiEndpoint: string | null, conversationId: string | null): string | null {
  if (!apiEndpoint || !conversationId) return null;
  const tenant = /^https?:\/\/[^/]+\/(\d+)/.exec(apiEndpoint.trim())?.[1];
  const id = conversationIdOf(conversationId);
  return tenant && id ? `https://live.wati.io/${tenant}/teamInbox/${id}` : null;
}

/** Longest message text kept — the log shows two lines of it. */
const TEXT_MAX = 500;

/** A message's text; media without a caption reads "[image]", "[document]", … */
export function messageText(m: Record<string, unknown>): string | null {
  const text = str(m.text) ?? str(m.caption);
  if (text) return text.slice(0, TEXT_MAX);
  const type = str(m.type);
  return type && type !== "text" ? `[${type.slice(0, 30)}]` : null;
}

/** WATI's chat id, only when it looks like one — it goes into a URL path. */
export function conversationIdOf(v: unknown): string | null {
  const s = str(v);
  return s && /^[A-Za-z0-9_-]{6,64}$/.test(s) ? s : null;
}

/** Top-level field names of a body (never values) — for diagnosing new shapes. */
export function keysOf(body: unknown): string[] | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return Object.keys(body).slice(0, 60).map((k) => k.slice(0, 64));
}

export function eventTypeOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  return str((body as Record<string, unknown>).eventType)?.slice(0, 64) ?? null;
}

/**
 * Our side of a chat: a message CS sent. WATI calls a typed reply
 * "sessionMessageSent" (a template reply "templateMessageSent"), and some
 * accounts deliver it as a "message" with `owner: true`.
 */
const OUTBOUND_EVENTS = new Set(["sessionMessageSent", "templateMessageSent"]);

/** Names WATI gives its own automations when they send for us. */
const AUTOMATED_RE = /\b(bot|chatbot|automation|system|wati|auto[- ]?reply|flow)\b/i;

/**
 * An automatic greeting goes out within a second or two; a person needs more
 * than 10. Used only when WATI names no operator — with an operator, the name
 * decides. (On a number running the WhatsApp Business app alongside WATI, no
 * reply carries an operator, so this is what separates greetings from people.)
 */
export const HUMAN_MIN_DELAY_MS = 10_000;

export type OutboundMessage = {
  phone: string;
  at: Date;
  /** Operator name or email, when WATI says who sent it. */
  by: string | null;
  /** False when the sender is clearly an automation. */
  human: boolean;
  /** True when WATI named no operator — the 20s rule applies downstream. */
  operatorUnknown: boolean;
  /** WATI's id for this chat, when sent. */
  conversationId: string | null;
  /** What we sent (see messageText). */
  text: string | null;
};

/**
 * A message we sent, or null. Who sent it matters: the reply-speed numbers are
 * about people, and a chatbot's instant "Hi, how can we help?" would make every
 * lead look answered in one second.
 */
export function parseOutbound(body: unknown, now: Date = new Date()): OutboundMessage | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const eventType = eventTypeOf(b);
  if (!eventType) return null;
  const outbound = OUTBOUND_EVENTS.has(eventType) || (eventType === "message" && b.owner === true);
  if (!outbound) return null;

  const phone = normalizePhone(b.waId);
  if (!phone) return null;

  const at = parseTime(b.timestamp) ?? parseTime(b.created) ?? now;
  const name = str(b.operatorName);
  const email = str(b.operatorEmail);
  const by = (name ?? email)?.slice(0, 120) ?? null;
  const automated = !!by && AUTOMATED_RE.test(`${name ?? ""} ${email ?? ""}`);

  return {
    phone,
    at: at.getTime() > now.getTime() + 5 * 60_000 ? now : at,
    by,
    human: !automated,
    operatorUnknown: !by,
    conversationId: conversationIdOf(b.conversationId),
    text: messageText(b),
  };
}

/**
 * Whether an outbound message counts as the lead's first human reply. Needs to
 * come after their first message; with no operator named, it must also be slow
 * enough not to be an auto-reply.
 */
export function countsAsReply(out: OutboundMessage, firstMessageAt: Date): boolean {
  if (!out.human) return false;
  const delay = out.at.getTime() - firstMessageAt.getTime();
  if (delay < 0) return false;
  return out.operatorUnknown ? delay >= HUMAN_MIN_DELAY_MS : true;
}

/**
 * The customer message in a WATI webhook body, or null when the body is
 * anything else. `now` is the fallback time when WATI sends none.
 */
export function parseInbound(body: unknown, now: Date = new Date()): InboundMessage | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const eventType = eventTypeOf(b);
  if (!eventType || !INBOUND_EVENTS.has(eventType)) return null;
  if (b.owner === true) return null;

  const phone = normalizePhone(b.waId);
  if (!phone) return null;

  const text = str(b.text);
  const at = parseTime(b.timestamp) ?? parseTime(b.created) ?? now;
  // A receipt time far in the future is a parsing accident, not a message from
  // tomorrow — it would push this person's first contact past every live.
  const safeAt = at.getTime() > now.getTime() + 5 * 60_000 ? now : at;

  return {
    phone,
    name: str(b.senderName)?.slice(0, 120) ?? null,
    text: text ? text.slice(0, FIRST_TEXT_MAX) : null,
    channelPhone: normalizePhone(b.channelPhoneNumber),
    at: safeAt,
    conversationId: conversationIdOf(b.conversationId),
  };
}
