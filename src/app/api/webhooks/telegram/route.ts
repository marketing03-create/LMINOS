import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { getBot } from "@/lib/telegram/bot";
import { escapeMd } from "@/lib/telegram/send";
import { verifyPairToken } from "@/lib/telegram/pairing";

/**
 * Telegram bot webhook handler. Commands:
 *   /start <token> — pair this chat to the LMIROS user who made the link
 *   /help          — usage
 *
 * Pairing needs a signed link made inside LMIROS (Admin → Integrations → Link
 * my Telegram), never an email: `/start <email>` used to let anyone redirect
 * any account's alerts to their own chat. See lib/telegram/pairing.ts.
 *
 * Pairing is what lets a live streamer receive their morning "lives still need
 * numbers" reminder, and admins the TikTok capture alerts. (The old /sale
 * conversion command left with the leads/sales features.)
 *
 * Telegram sends a verification secret in the X-Telegram-Bot-Api-Secret-Token
 * header iff `secret_token` was set when registering the webhook; we enforce it.
 */
async function reply(chatId: number, text: string) {
  const bot = getBot();
  if (!bot) return;
  await bot.api.sendMessage(chatId, text).catch(() => {});
}

export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== expected) {
      return new NextResponse("invalid secret", { status: 401 });
    }
  }

  let update: {
    message?: {
      chat?: { id?: number };
      from?: { username?: string; first_name?: string };
      text?: string;
    };
  };
  try {
    update = await request.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const msg = update.message;
  const text = msg?.text?.trim() ?? "";
  const chatId = msg?.chat?.id;
  if (!chatId) return NextResponse.json({ ok: true, handled: false });

  // ── /help ──
  if (text.startsWith("/help")) {
    await reply(
      chatId,
      [
        "To link this chat to LMIROS:",
        "open LMIROS → Admin → Integrations → Link my Telegram,",
        "then tap the link it gives you.",
      ].join("\n")
    );
    return NextResponse.json({ ok: true, handled: "help" });
  }

  // ── /start <email> — pairing ──
  if (!text.startsWith("/start")) {
    return NextResponse.json({ ok: true, handled: false });
  }

  const arg = text.replace(/^\/start\s*/, "").trim();
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const userId = arg && botToken ? verifyPairToken(arg, botToken) : null;

  if (!userId) {
    await reply(
      chatId,
      arg
        ? "That link has expired or isn't valid. Open LMIROS → Admin → Integrations → Link my Telegram for a new one."
        : "To link this chat, open LMIROS → Admin → Integrations → Link my Telegram, then tap the link it gives you."
    );
    return NextResponse.json({ ok: true, paired: false, reason: arg ? "bad_token" : "no_token" });
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.isActive) {
    await reply(chatId, "That LMIROS account isn't active. Ask your admin.");
    return NextResponse.json({ ok: true, paired: false, reason: "no_user" });
  }
  const bot = getBot();

  await db
    .update(users)
    .set({ telegramChatId: String(chatId) })
    .where(eq(users.id, user.id));

  await writeAudit({
    actorUserId: user.id,
    eventType: "user.telegram_paired",
    entityType: "user",
    entityId: user.id,
    after: { telegram_chat_id: String(chatId) },
  });

  if (bot) {
    await bot.api
      .sendMessage(
        chatId,
        `✅ Linked to *${escapeMd(user.email)}*\\. You'll get LMIROS alerts here\\.`,
        { parse_mode: "MarkdownV2" }
      )
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, paired: true });
}
