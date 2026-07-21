/**
 * Phase 2 (Fly worker): watch every active TikTok handle and auto-capture each
 * live. Polls live status every ~5 min; when a handle goes live it runs the
 * SAME captureLive() the laptop CLI uses, guarding against double-capture.
 * Writes a liveness heartbeat each poll so the dashboard can show health.
 *
 * Self-healing: the connector is reverse-engineered and can silently stall over
 * time, so the worker RECYCLES itself on a schedule (only when idle — never
 * mid-capture) → Fly restarts it clean with a fresh TikTok connection. This
 * clears stalls proactively without false alarms. (`fetchIsLive` throws for an
 * offline handle, so a throw is treated as "not live", NOT as a fault.) The
 * daily /api/cron/tiktok-health job is the catch-all: it pings admins if no
 * lives were captured in 24h, so a real outage is never silent for long.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, workerHeartbeats } from "@/db/schema";
import { captureLive } from "@/lib/tiktok-live/connector";
import { DEFAULT_KEYWORDS } from "@/lib/tiktok-live/keyword-match";
import { isHandleLive } from "@/lib/tiktok-live/live-status";

const POLL_MS = 5 * 60_000;
const HEARTBEAT_NAME = "tiktok-live-monitor";
// Recycle the process every few hours (only when nothing is being captured) so
// a silent connector stall can't linger. Fly restarts it → fresh connection.
const RECYCLE_MS = 6 * 60 * 60 * 1000;

export function startTikTokLiveMonitor() {
  const capturing = new Set<string>();
  let stopped = false;
  const startedAt = Date.now();

  async function tick() {
    if (stopped) return;

    // Preventive self-heal: recycle when idle for a fresh TikTok connection.
    if (Date.now() - startedAt > RECYCLE_MS && capturing.size === 0) {
      console.log("[tiktok-monitor] scheduled recycle (idle) — restarting for a fresh connection");
      // Exit NON-ZERO so Fly restarts us under ANY restart policy (both
      // "always" and the default "on-failure" bring back a non-zero exit; a
      // clean exit(0) under on-failure would stay stopped — the 3–6 Jul outage).
      process.exit(1);
    }

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

    // Liveness heartbeat — the dashboard reads this to show "tracker running /
    // may be down" in plain English, so no one needs flyctl. Best-effort.
    try {
      const now = new Date();
      const note = `watching ${accounts.length} handle${accounts.length === 1 ? "" : "s"}`;
      await db
        .insert(workerHeartbeats)
        .values({ name: HEARTBEAT_NAME, lastBeatAt: now, note })
        .onConflictDoUpdate({
          target: workerHeartbeats.name,
          set: { lastBeatAt: now, note },
        });
    } catch {
      // never let a heartbeat write break the poll
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
