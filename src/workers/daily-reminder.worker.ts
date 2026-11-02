/**
 * 11:30am Malaysia-time weekly-data reminder, triggered from the Fly worker.
 *
 * Vercel Hobby crons fire "somewhere in the hour", so an 11:30 reminder can't
 * be a Vercel cron. This loop checks every minute and, once a day from 11:30,
 * calls LMIROS's /api/cron/tiktok-weekly-check — the push notification itself
 * is sent by LMIROS, which holds the VAPID keys. The last run is kept in
 * `worker_heartbeats` so the worker's own ~6h restarts don't re-fire it.
 *
 * Needs REMINDER_TRIGGER_SECRET (same value as on Vercel). Without it the loop
 * logs once and stays idle — the live monitor is never affected.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workerHeartbeats } from "@/db/schema";
import { dailyTriggerDue } from "./daily-trigger-core";

const CHECK_MS = 60_000;
const RUN_NAME = "weekly-reminder-1130";
const AT = "11:30";
const UNTIL = "14:00";
const ENDPOINT = "/api/cron/tiktok-weekly-check";

export function startDailyReminder() {
  const secret = process.env.REMINDER_TRIGGER_SECRET;
  const base = process.env.LMIROS_URL ?? "https://lmiros.vercel.app";
  if (!secret) {
    console.warn("[daily-reminder] REMINDER_TRIGGER_SECRET not set — 11:30 reminder disabled");
    return { async close() {} };
  }

  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const [last] = await db
        .select({ lastBeatAt: workerHeartbeats.lastBeatAt })
        .from(workerHeartbeats)
        .where(eq(workerHeartbeats.name, RUN_NAME))
        .limit(1);
      const now = new Date();
      if (!dailyTriggerDue(now, last?.lastBeatAt ?? null, AT, UNTIL)) return;

      const res = await fetch(`${base}${ENDPOINT}`, {
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(60_000),
      });
      const note = `${res.status} ${(await res.text()).slice(0, 200)}`;
      console.log(`[daily-reminder] 11:30 weekly check → ${note}`);
      // Only a success counts as today's run; a failure retries next minute.
      if (res.ok) {
        await db
          .insert(workerHeartbeats)
          .values({ name: RUN_NAME, lastBeatAt: now, note })
          .onConflictDoUpdate({
            target: workerHeartbeats.name,
            set: { lastBeatAt: now, note },
          });
      }
    } catch (e) {
      console.error("[daily-reminder]", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  }

  void tick();
  const timer = setInterval(() => void tick(), CHECK_MS);
  return {
    async close() {
      clearInterval(timer);
    },
  };
}
