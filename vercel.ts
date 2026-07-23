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
  // /dashboard was the Overview page, which left with the leads/sales features.
  // Old bookmarks and cached links still point there, so bounce them to "/",
  // which picks the right home for the signed-in user's role. Temporary, not
  // permanent — browsers cache a 308 forever, and we may want the path back.
  redirects: [{ source: "/dashboard", destination: "/", permanent: false }],

  // Vercel Hobby allows 2 cron jobs, once per day each — so both daily checks
  // fit, but the ~1h post-live nudge (needs sub-daily) can't be a cron here.
  // It's exposed at /api/cron/tiktok-post-live-nudge for an hourly external
  // trigger; the 10pm job calls the same logic as a daily catch-all.
  crons: [
    {
      // 10am Malaysia time (UTC+8) = 02:00 UTC — chase LEAD numbers (Total /
      // Filtered Leads), which Customer Service fills as leads come in.
      path: "/api/cron/tiktok-missing-results",
      schedule: "0 2 * * *",
    },
    {
      // 10pm Malaysia time = 14:00 UTC — re-check LIVE metrics (DMs, Bio views)
      // the streamer keys from the TikTok backend, and first-nudge (catch-all)
      // any live that ended today and was never nudged.
      path: "/api/cron/tiktok-evening-metrics",
      schedule: "0 14 * * *",
    },
  ],

  // ─── Pro-tier schedule (uncomment AFTER upgrading) ─────────────────────
  // crons: [
  //   { path: "/api/cron/sla-scan",    schedule: "* * * * *"   },
  //   { path: "/api/cron/sheets-sync", schedule: "*/2 * * * *" },
  //   { path: "/api/cron/tiktok-poll", schedule: "*/5 * * * *" },
  // ],
};
