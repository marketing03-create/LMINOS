import { type VercelConfig } from "@vercel/config/v1";

/**
 * LMIROS Vercel project config.
 *
 * Crons are kept in a single place so we can scale the cadence as load grows.
 *   sla-scan       — every minute, surface SLA breaches
 *   sheets-sync    — every 2 min, pull sales rows from Google Sheets (Week 5)
 *   tiktok-poll    — every 5 min, fallback for missed TikTok webhooks
 *
 * Cron secret is enforced by each handler reading `Authorization: Bearer ${CRON_SECRET}`.
 */
export const config: VercelConfig = {
  framework: "nextjs",
  regions: ["sin1"], // pin to Singapore for PDPA + Malaysia latency
  // Vercel Hobby caps cron frequency at "once per day". For real-time SLA
  // detection and 2-min sheets-sync, either:
  //   (a) upgrade to Vercel Pro ($20/mo) — uncomment the Pro block below, OR
  //   (b) trigger /api/cron/* from an external scheduler (cron-job.org etc.)
  //       passing `Authorization: Bearer ${CRON_SECRET}`.
  //
  // For now: one daily run of sla-scan so the cron infra is wired up.
  crons: [
    {
      path: "/api/cron/sla-scan",
      schedule: "0 0 * * *", // daily at midnight UTC
    },
  ],

  // ─── Pro-tier schedule (uncomment AFTER upgrading) ─────────────────────
  // crons: [
  //   { path: "/api/cron/sla-scan",    schedule: "* * * * *"   },
  //   { path: "/api/cron/sheets-sync", schedule: "*/2 * * * *" },
  //   { path: "/api/cron/tiktok-poll", schedule: "*/5 * * * *" },
  // ],
};
