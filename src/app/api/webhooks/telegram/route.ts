import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { getBot } from "@/lib/telegram/bot";
import { escapeMd } from "@/lib/telegram/send";
import { parseSaleCommand, recordConversion } from "@/lib/telegram/conversions";

/**
 * Telegram bot webhook handler. Commands:
 *   /start <email>         — pair this chat to a LMIROS user
 *   /sale <phone> <amount> — record a closed deal (aliases: /close /won /deal)
 *   /help                  — usage
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
        "LMIROS bot commands:",
        "/start your.email@company.com — link your account",
        "/sale <phone> <amount> — record a closed deal, e.g. /sale 0123456789 25000",
        "  (works for WhatsApp customers too — if there's no lead yet, one is created and credited to you)",
      ].join("\n")
    );
    return NextResponse.json({ ok: true, handled: "help" });
  }

  // ── /sale (+ aliases) — record a conversion ──
  if (/^\/(sale|close|won|deal)\b/i.test(text)) {
    const parsed = parseSaleCommand(text);
    if (!parsed) {
      await reply(
        chatId,
        "Format: /sale <phone> <amount>  —  e.g. /sale 0123456789 25000"
      );
      return NextResponse.json({ ok: true, handled: "sale_badformat" });
    }
    const result = await recordConversion({
      senderChatId: String(chatId),
      phone: parsed.phone,
      amount: parsed.amount,
    });
    await reply(chatId, result.message);
    return NextResponse.json({ ok: true, handled: "sale", success: result.ok });
  }

  // ── /start <email> — pairing ──
  if (!text.startsWith("/start")) {
    return NextResponse.json({ ok: true, handled: false });
  }

  const email = text.replace(/^\/start\s*/, "").trim().toLowerCase();
  const bot = getBot();

  if (!email) {
    if (bot) {
      await bot.api
        .sendMessage(
          chatId,
          "Send `/start your.email@company\\.com` to link this Telegram chat to your LMIROS account\\.",
          { parse_mode: "MarkdownV2" }
        )
        .catch(() => {});
    }
    return NextResponse.json({ ok: true, handled: false, reason: "no_email" });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user) {
    if (bot) {
      await bot.api
        .sendMessage(chatId, `No LMIROS user found for *${escapeMd(email)}*\\.`, {
          parse_mode: "MarkdownV2",
        })
        .catch(() => {});
    }
    return NextResponse.json({ ok: true, paired: false, reason: "no_user" });
  }

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
        `✅ Linked to *${escapeMd(user.email)}*\\. You'll receive lead alerts here\\.`,
        { parse_mode: "MarkdownV2" }
      )
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, paired: true });
}
