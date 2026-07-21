/**
 * Fire the "a streamer just went live" alert — both channels the user asked for:
 *   1. an in-app pop-out (a row in app_notifications the dashboard polls), and
 *   2. a Telegram ping to every paired admin.
 *
 * Runs from the TikTok connector (laptop CLI / Fly worker), the moment we
 * confirm a handle is live. Exactly-once per live: the app_notifications insert
 * dedupes on the room id, and we only ping Telegram when that insert was NEW
 * (so a connector reconnect to the same room never double-alerts). Best-effort —
 * never throws, so a notification hiccup can't break the capture.
 */
import { db } from "@/db/client";
import { appNotifications } from "@/db/schema";
import { alertAdmins } from "@/lib/telegram/alert";

export async function notifyLiveStarted(input: {
  handle: string;
  roomId: string;
  title: string | null;
}): Promise<void> {
  const handle = input.handle.replace(/^@+/, "");
  const dedupeKey = `tiktok:${input.roomId}`;

  let isNew = false;
  try {
    const inserted = await db
      .insert(appNotifications)
      .values({
        type: "tiktok_live_started",
        title: `@${handle} is LIVE`,
        body: input.title ?? null,
        handle,
        href: "/tiktok-live",
        dedupeKey,
      })
      .onConflictDoNothing({
        target: [appNotifications.type, appNotifications.dedupeKey],
      })
      .returning({ id: appNotifications.id });
    isNew = inserted.length > 0;
  } catch {
    // DB write failed — skip Telegram too, so a retry can't spam (we can't
    // guarantee dedup without the insert landing).
    return;
  }

  if (!isNew) return; // already alerted for this live

  try {
    const t = input.title ? ` — "${input.title}"` : "";
    await alertAdmins(`🔴 @${handle} just went LIVE on TikTok${t}`);
  } catch {
    // best-effort — the in-app pop-out already landed
  }
}
