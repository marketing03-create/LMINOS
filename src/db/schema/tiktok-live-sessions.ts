import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { tiktokAccounts } from "./tiktok-accounts";

/**
 * One row per finished TikTok LIVE session, summarized. Pulled from the managed
 * vendor by `syncTikTokLive()`. Idempotent on (accountId, externalSessionId).
 * Diamonds/gifts intentionally omitted (irrelevant to loan marketing — easy to
 * add later). Intra-session time-series snapshots are a future table.
 */
export const tiktokLiveSessions = pgTable(
  "tiktok_live_sessions",
  {
    id: id(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tiktokAccounts.id, { onDelete: "cascade" }),
    // Vendor/room id for this live — the idempotency key per account.
    externalSessionId: text("external_session_id").notNull(),
    title: text("title"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    peakViewers: integer("peak_viewers").notNull().default(0),
    avgViewers: integer("avg_viewers").notNull().default(0),
    totalViews: integer("total_views").notNull().default(0),
    totalLikes: integer("total_likes").notNull().default(0),
    totalComments: integer("total_comments").notNull().default(0),
    totalShares: integer("total_shares").notNull().default(0),
    newFollowers: integer("new_followers"),
    // Which loan product(s)/service(s) this live promoted, streamer-tagged on the
    // session page. Null/[] = not tagged. Each is one of TIKTOK_PRODUCTS
    // (app-level list in src/lib/tiktok-live/products.ts — kept flexible vs a pg
    // enum). `product` is the legacy single-value column (frozen; `products` is
    // the source of truth going forward).
    product: text("product"),
    products: text("products").array(),
    // ── Manually entered from the TikTok creator backend — the TikTok-only
    // metrics the public connector can't capture (no live-analytics API exists).
    // Null = not entered. Admins fill these on the session page after a live. ──
    uniqueViewers: integer("unique_viewers"),
    activeViewers: integer("active_viewers"),
    avgWatchSeconds: integer("avg_watch_seconds"),
    directMessages: integer("direct_messages"),
    serviceBioViews: integer("service_bio_views"),
    interestedViewers: integer("interested_viewers"),
    diamonds: integer("diamonds"),
    // Total Leads = the UNIQUE customers who contacted CS from this live, counted
    // once per phone number (so the same person on TikTok DM + WhatsApp counts
    // once — no double-count). Entered by CS (manual now; a WhatsApp Business
    // Cloud API feed can auto-fill it later). Null = not entered.
    totalLeads: integer("total_leads"),
    // Deprecated/unused: an earlier design split leads by source (DM vs WhatsApp)
    // and summed them, but that double-counted the ~30-40% who use both channels,
    // so it was replaced by the single deduped `totalLeads` above. Columns kept
    // (nullable, never written) to avoid a destructive migration.
    dmLeads: integer("dm_leads"),
    whatsappLeads: integer("whatsapp_leads"),
    // Quality leads after customer service collects documents — entered by the
    // streamer/CS (not from any TikTok screen). Null = not entered.
    filteredLeads: integer("filtered_leads"),
    // Unique viewers who commented a lead keyword (e.g. "PM") in the public live
    // chat — captured AUTOMATICALLY by the connector. Detail rows live in
    // `tiktok_live_leads`. A follow-up worklist / intent signal, shown separately
    // from the deduped Total Leads (not summed into it).
    keywordLeads: integer("keyword_leads").notNull().default(0),
    rawPayload: jsonb("raw_payload"),
    ...timestamps(),
  },
  (t) => ({
    uq: uniqueIndex("tiktok_live_sessions_uq").on(
      t.accountId,
      t.externalSessionId
    ),
    acctStartedIdx: index("tiktok_live_sessions_acct_started_idx").on(
      t.accountId,
      t.startedAt
    ),
  })
);
