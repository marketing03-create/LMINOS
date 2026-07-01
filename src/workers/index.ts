/**
 * Local dev worker. Run with `npm run worker`.
 *
 * In production, queue consumers run as long-lived Vercel Functions
 * triggered by BullMQ events (see plan §5). For local dev we keep them
 * in a single Node process for simpler debugging.
 */
import { startLeadDedupeWorker } from "./lead-dedupe.worker";
import { startLeadIngestWorker } from "./lead-ingest.worker";
import { startLeadNotifyWorker } from "./lead-notify.worker";
import { startLeadRouteWorker } from "./lead-route.worker";
import { startSalesMatchWorker } from "./sales-match.worker";
import { startTikTokLiveMonitor } from "./tiktok-live-monitor.worker";

const workers = [
  startLeadIngestWorker(),
  startLeadDedupeWorker(),
  startLeadRouteWorker(),
  startLeadNotifyWorker(),
  startSalesMatchWorker(),
  startTikTokLiveMonitor(),
];

console.log(
  `[worker] started ${workers.length} consumers: lead.ingest, lead.dedupe, lead.route, lead.notify, sales.match, tiktok-live-monitor`
);

async function shutdown(signal: string) {
  console.log(`\n[worker] ${signal} received, shutting down…`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
