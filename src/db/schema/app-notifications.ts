import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { id, createdAt } from "./columns";

/**
 * In-app pop-out feed for admins (distinct from the per-lead `notifications`
 * delivery log). Rows are written by off-Vercel code (the TikTok connector on
 * the laptop/Fly worker) and polled by the dashboard, which shows a top-center
 * toast for fresh ones. `type` is plain text (no enum) so new event kinds need
 * no migration. `dedupeKey` makes each logical event insert at most once (e.g.
 * one "live started" per TikTok room, even if the connector reconnects).
 */
export const appNotifications = pgTable(
  "app_notifications",
  {
    id: id(),
    type: text("type").notNull(), // e.g. "tiktok_live_started"
    title: text("title").notNull(),
    body: text("body"),
    handle: text("handle"), // streamer @handle, when relevant
    href: text("href"), // where the toast's "View" link points
    dedupeKey: text("dedupe_key"), // one row per logical event; null = never deduped
    createdAt: createdAt(),
  },
  (t) => ({
    createdIdx: index("app_notifications_created_idx").on(t.createdAt),
    dedupeUniq: uniqueIndex("app_notifications_dedupe_uniq").on(t.type, t.dedupeKey),
  })
);
