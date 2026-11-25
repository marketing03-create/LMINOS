/**
 * TikTok DMs in WATI webhooks — pure rules, so they're pinned in tests.
 *
 * WATI can connect a TikTok account; its DMs arrive on the same account
 * webhook as WhatsApp. WATI hasn't published that payload yet, so the reader is
 * deliberately tolerant: a body is a TikTok DM when any channel/source field
 * says "tiktok" (or a field is named for TikTok), and the person is whichever
 * TikTok id field is present. Bodies that are neither WhatsApp nor TikTok are
 * kept as SHAPES (field names + value types, never values) — see shapeOf — so
 * the first real DM shows exactly what WATI sends.
 */

export type TikTokMessage = {
  direction: "in" | "out";
  /** WATI's id for the connected TikTok account ("tiktok" when it doesn't say). */
  channelId: string;
  /** What WATI calls that account (its name / TikTok username), if it says. */
  channelLabel: string | null;
  /** TikTok's id for the person; a DM has no phone number. */
  senderId: string;
  name: string | null;
  text: string | null;
  at: Date;
  conversationId: string | null;
  /** Who replied, for outbound messages (operator name/email). */
  by: string | null;
};

const TEXT_MAX = 500;
const HINT_FIELDS = ["channelType", "channel", "channelName", "channelSource", "platform", "source", "sourceType", "type"];
const SENDER_FIELDS = ["tikTokUserId", "tiktokUserId", "tikTokId", "tiktokId", "senderId", "userId", "fromId", "username", "waId"];
const LABEL_FIELDS = ["channelName", "tikTokUsername", "tiktokUsername", "channelUsername", "accountName", "pageName"];

const str = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function time(v: unknown): Date | null {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n) && /^\d+$/.test(v.trim())) return new Date(n < 1e12 ? n * 1000 : n);
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t);
  }
  return null;
}

/** True when the body says it came through TikTok. */
export function isTikTok(b: Record<string, unknown>): boolean {
  if (HINT_FIELDS.some((k) => /tik\s*-?_?tok/i.test(String(b[k] ?? "")))) return true;
  return Object.entries(b).some(([k, v]) => /tik_?tok/i.test(k) && v !== null && v !== undefined && v !== "" && v !== 0 && v !== false);
}

const INBOUND = new Set(["message", "newContactMessageReceived", "messageReceived"]);
const OUTBOUND = new Set(["sessionMessageSent", "templateMessageSent"]);

/** A TikTok DM (either way) from a webhook body, or null when it isn't one. */
export function parseTikTokMessage(body: unknown, now: Date = new Date()): TikTokMessage | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!isTikTok(b)) return null;
  const eventType = str(b.eventType) ?? "message";
  const out = OUTBOUND.has(eventType) || (eventType === "message" && b.owner === true);
  if (!out && !INBOUND.has(eventType)) return null;

  let senderId: string | null = null;
  for (const k of SENDER_FIELDS) {
    senderId = str(b[k]);
    if (senderId) break;
  }
  senderId ??= str(b.conversationId);
  if (!senderId) return null;

  let label: string | null = null;
  for (const k of LABEL_FIELDS) {
    label = str(b[k]);
    if (label) break;
  }
  const at = time(b.timestamp) ?? time(b.created) ?? now;
  const text = str(b.text) ?? str((b.data as Record<string, unknown> | undefined)?.text);
  return {
    direction: out ? "out" : "in",
    channelId: (str(b.channelId) ?? "tiktok").slice(0, 120),
    channelLabel: label ? label.replace(/^@/, "").slice(0, 120) : null,
    senderId: senderId.slice(0, 200),
    name: (str(b.senderName) ?? str(b.username))?.slice(0, 120) ?? null,
    text: text ? text.slice(0, TEXT_MAX) : str(b.type) && str(b.type) !== "text" ? `[${str(b.type)}]` : null,
    // A receipt time far in the future is a parsing accident.
    at: at.getTime() > now.getTime() + 5 * 60_000 ? now : at,
    conversationId: str(b.conversationId)?.slice(0, 120) ?? null,
    by: out ? (str(b.operatorName) ?? str(b.operatorEmail))?.slice(0, 120) ?? null : null,
  };
}

/** Field name → value type, never the value (a phone-like string is just "phone-like"). */
export function shapeOf(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>).slice(0, 80)) {
    const key = k.slice(0, 64);
    if (v === null || v === undefined) out[key] = "null";
    else if (Array.isArray(v)) out[key] = "array";
    else if (typeof v === "string") out[key] = /^\+?\d{8,}$/.test(v.trim()) ? "phone-like" : v.trim() ? "string" : "empty";
    else out[key] = typeof v;
  }
  return out;
}

/** One stable key per shape: its sorted field names. */
export function shapeSignature(shape: Record<string, string>): string {
  return Object.keys(shape).sort().join(",").slice(0, 2000);
}
