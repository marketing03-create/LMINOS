/**
 * LMIROS's own phone notifications (Web Push). SERVER-ONLY.
 *
 * A device subscribes once (the "Turn on notifications" button); after that
 * any server code can reach it with `pushToUser`. The push services (Apple,
 * Google, Mozilla) only ever see an encrypted payload.
 *
 * Every function here is best-effort and never throws: a reminder that fails
 * to buzz a phone has still been written to the in-app bell.
 */
import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { serverEnv } from "@/lib/env";

export type PushMessage = {
  title: string;
  body?: string;
  /** Path opened when the notification is tapped. */
  url?: string;
  /** Same tag replaces the previous notification instead of stacking. */
  tag?: string;
};

let configured: boolean | null = null;

/** True once VAPID keys are present; configures web-push the first time. */
export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const env = serverEnv();
  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(env.VAPID_SUBJECT ?? "https://lmiros.vercel.app", pub, priv);
  return (configured = true);
}

/**
 * Send to every device a user has turned notifications on for. Returns how
 * many devices accepted it (0 = nobody's phone was reached). Devices the push
 * service says are gone (404/410) are deleted on the spot.
 */
export async function pushToUser(userId: string, msg: PushMessage): Promise<number> {
  if (!pushConfigured()) return 0;
  try {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    if (subs.length === 0) return 0;

    const payload = JSON.stringify(msg);
    const gone: string[] = [];
    let delivered = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 24 } // a phone offline for a day still gets it
          );
          delivered += 1;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(s.id);
          else console.error("[push] send failed:", code, (err as Error).message);
        }
      })
    );
    if (gone.length) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
    }
    return delivered;
  } catch (err) {
    console.error("[push] pushToUser failed:", err);
    return 0;
  }
}
