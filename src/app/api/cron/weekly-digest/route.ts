import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/auth/cron";
import { and, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getBot } from "@/lib/telegram/bot";
import { buildWeeklyDigest } from "@/lib/insights/digest";

/**
 * Weekly performance digest → Telegram for HQ / marketing managers.
 * Trigger via cron-job.org weekly with `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  try {
    const { text, alerts } = await buildWeeklyDigest();

    const recipients = await db
      .select({ chatId: users.telegramChatId })
      .from(users)
      .where(
        and(
          inArray(users.role, ["hq_admin", "marketing_manager"]),
          isNotNull(users.telegramChatId)
        )
      );

    const bot = getBot();
    let sent = 0;
    if (bot) {
      for (const r of recipients) {
        if (!r.chatId) continue;
        await bot.api.sendMessage(r.chatId, text).then(
          () => sent++,
          () => {}
        );
      }
    }

    return NextResponse.json({
      ok: true,
      recipients: recipients.length,
      sent,
      alerts: alerts.length,
    });
  } catch (err) {
    console.error("[cron/weekly-digest] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
