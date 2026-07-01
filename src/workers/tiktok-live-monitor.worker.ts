/**
 * Phase 2 (Fly worker): watch every active TikTok handle and auto-capture each
 * live. Polls live status every minute; when a handle goes live it runs the
 * SAME captureLive() the laptop CLI uses, guarding against double-capture.
 *
 * Built now; activated when the always-on worker is deployed (`flyctl deploy`).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts } from "@/db/schema";
import { captureLive } from "@/lib/tiktok-live/connector";
import { DEFAULT_KEYWORDS } from "@/lib/tiktok-live/keyword-match";
import { isHandleLive } from "@/lib/tiktok-live/live-status";

const POLL_MS = 60_000;

export function startTikTokLiveMonitor() {
  const capturing = new Set<string>();
  let stopped = false;

  async function tick() {
    if (stopped) return;
    let accounts: { id: string; handle: string; leadKeywords: string[] | null }[] = [];
    try {
      accounts = await db
        .select({
          id: tiktokAccounts.id,
          handle: tiktokAccounts.handle,
          leadKeywords: tiktokAccounts.leadKeywords,
        })
        .from(tiktokAccounts)
        .where(eq(tiktokAccounts.isActive, true));
    } catch (e) {
      console.error("[tiktok-monitor] load accounts:", e instanceof Error ? e.message : e);
      return;
    }

    for (const acct of accounts) {
      if (capturing.has(acct.handle)) continue;
      isHandleLive(acct.handle)
        .then((live) => {
          if (!live || stopped || capturing.has(acct.handle)) return;
          capturing.add(acct.handle);
          const keywords = acct.leadKeywords?.length ? acct.leadKeywords : DEFAULT_KEYWORDS;
          console.log(`[tiktok-monitor] @${acct.handle} is LIVE → capturing`);
          captureLive(acct.handle, {
            accountId: acct.id,
            keywords,
            log: (m) => console.log(`[tiktok-monitor] ${m}`),
          })
            .catch((e) =>
              console.error(`[tiktok-monitor] @${acct.handle}:`, e instanceof Error ? e.message : e)
            )
            .finally(() => capturing.delete(acct.handle));
        })
        .catch(() => {});
    }
  }

  void tick();
  const timer = setInterval(() => void tick(), POLL_MS);

  return {
    async close() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
