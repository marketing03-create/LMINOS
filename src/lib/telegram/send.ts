import { getBot } from "./bot";

export type SendResult =
  | { ok: true; messageId: number }
  | { ok: false; reason: string };

export async function sendMarkdown(
  chatId: string,
  text: string
): Promise<SendResult> {
  const bot = getBot();
  if (!bot) return { ok: false, reason: "no_token" };

  try {
    const sent = await bot.api.sendMessage(chatId, text, {
      parse_mode: "MarkdownV2",
      link_preview_options: { is_disabled: true },
    });
    return { ok: true, messageId: sent.message_id };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Escape special MarkdownV2 characters so user-provided values don't break
 * the message. https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMd(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (m) => `\\${m}`);
}
