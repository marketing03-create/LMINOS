/**
 * Send an operational alert to every admin who has paired Telegram. Best-effort
 * (never throws) — used by the TikTok capture watchdog (worker self-heal + the
 * health cron) so a silent failure becomes an instant ping.
 */
import { and, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { escapeMd, sendMarkdown } from "./send";

const ALERT_ROLES = ["hq_admin", "marketing_manager"] as const;

export async function alertAdmins(text: string): Promise<number> {
  let recipients: { chatId: string | null }[] = [];
  try {
    recipients = await db
      .select({ chatId: users.telegramChatId })
      .from(users)
      .where(
        and(
          inArray(users.role, ALERT_ROLES),
          isNotNull(users.telegramChatId)
        )
      );
  } catch {
    return 0;
  }

  let sent = 0;
  for (const r of recipients) {
    if (!r.chatId) continue;
    try {
      const res = await sendMarkdown(r.chatId, escapeMd(text));
      if (res.ok) sent += 1;
    } catch {
      // best-effort — one bad recipient must not stop the others
    }
  }
  return sent;
}
