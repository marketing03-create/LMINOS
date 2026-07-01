import { Bot } from "grammy";

let cached: Bot | null = null;

/**
 * Lazily-constructed grammy Bot. Returns `null` if TELEGRAM_BOT_TOKEN
 * is not configured (so dev environments without Telegram still work —
 * notification worker falls back to logging).
 */
export function getBot(): Bot | null {
  if (cached) return cached;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  cached = new Bot(token);
  return cached;
}
