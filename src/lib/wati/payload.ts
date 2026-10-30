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

export function eventTypeOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  return str((body as Record<string, unknown>).eventType)?.slice(0, 64) ?? null;
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
  };
}
