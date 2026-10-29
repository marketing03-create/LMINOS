/**
 * Telegram pairing by signed link, not by email.
 *
 * The bot used to accept `/start <any email>` and point that account's alerts
 * at whoever sent it — no proof of owning the address. Now only LMIROS can
 * make a pairing link: a signed-in user asks for one, the server signs
 * (their user id + an expiry) with a key derived from the bot token, and the
 * bot accepts `/start <token>` only if the signature checks out and the link
 * is under 15 minutes old. Nothing to store, so no table.
 *
 * Token = 32 hex (user id, dashes removed) + expiry (seconds, base36) + "_" +
 * 16-char HMAC — about 56 characters, inside Telegram's 64-char,
 * [A-Za-z0-9_-] limit for a /start parameter.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PAIR_TTL_SECONDS = 15 * 60;

function key(botToken: string): Buffer {
  return createHmac("sha256", "lmiros-telegram-pairing").update(botToken).digest();
}

function sign(payload: string, botToken: string): string {
  return createHmac("sha256", key(botToken)).update(payload).digest("base64url").slice(0, 16);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makePairToken(userId: string, botToken: string, nowMs = Date.now()): string {
  if (!UUID.test(userId)) throw new Error("bad user id");
  const hex = userId.replace(/-/g, "").toLowerCase();
  const exp = Math.floor(nowMs / 1000 + PAIR_TTL_SECONDS).toString(36);
  const payload = hex + exp;
  return `${payload}_${sign(payload, botToken)}`;
}

/** The user id the token was made for, or null if forged, malformed or expired. */
export function verifyPairToken(token: string, botToken: string, nowMs = Date.now()): string | null {
  const m = /^([0-9a-f]{32})([0-9a-z]{1,10})_([A-Za-z0-9_-]{16})$/.exec(token.trim());
  if (!m) return null;
  const [, hex, exp, sig] = m;
  const expected = Buffer.from(sign(hex + exp, botToken));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (parseInt(exp, 36) * 1000 < nowMs) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
