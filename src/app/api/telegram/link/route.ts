import { NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { getBot } from "@/lib/telegram/bot";
import { makePairToken } from "@/lib/telegram/pairing";

let botUsername: string | null = null;

/**
 * A 15-minute Telegram pairing link for the SIGNED-IN user only. Opening it
 * starts the bot with a signed token, which links that Telegram chat to this
 * account (see lib/telegram/pairing.ts). Nobody can make a link for someone else.
 */
export async function POST() {
  const auth = await requireRole([...ADMIN_ROLES, "live_streamer"]);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  if (!auth.userId) {
    return NextResponse.json({ ok: false, error: "Sign in with your own account first." }, { status: 400 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const bot = getBot();
  if (!token || !bot) {
    return NextResponse.json({ ok: false, error: "Telegram isn't set up yet." }, { status: 503 });
  }
  try {
    botUsername ??= (await bot.api.getMe()).username;
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reach Telegram. Try again." }, { status: 502 });
  }

  const start = makePairToken(auth.userId, token);
  return NextResponse.json({ ok: true, url: `https://t.me/${botUsername}?start=${start}` });
}
