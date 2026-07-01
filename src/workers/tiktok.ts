/**
 * TikTok Live always-on worker (Fly.io entry point).
 *
 * Runs ONLY the TikTok live monitor: it polls each tracked handle's live status
 * and auto-captures every live start-to-finish. Needs just DATABASE_URL — no
 * Redis, no other secrets. (The full BullMQ worker lives in index.ts.)
 */
import { startTikTokLiveMonitor } from "./tiktok-live-monitor.worker";

const monitor = startTikTokLiveMonitor();
console.log("[tiktok-worker] started — watching tracked TikTok handles for lives");

async function shutdown(signal: string) {
  console.log(`\n[tiktok-worker] ${signal} received, shutting down…`);
  await monitor.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
