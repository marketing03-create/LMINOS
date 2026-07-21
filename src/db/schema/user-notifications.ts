import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { users } from "./users";

/**
 * Per-user Notification Center (the bell + badge in the app shell).
 *
 * Distinct from `app_notifications` (a GLOBAL, ephemeral admin toast feed) and
 * from `notifications` (a per-lead delivery LOG that is never read back). Kept
 * separate so the admin toast path stays untouched: app_notifications' unique
 * (type, dedupe_key) is what the reminder cron uses as its once-a-day gate, and
 * adding a nullable user_id there would break that dedupe (Postgres unique
 * indexes are NULLS DISTINCT).
 *
 * `user_id` and `dedupe_key` are both NOT NULL so (user_id, type, dedupe_key)
 * has no NULL hole — every write is idempotent. The reminder cron upserts ONE
 * row per streamer and resets `read_at` each morning, so a still-unfinished live
 * re-surfaces the badge instead of piling up a new row every day.
 *
 * `session_ids` powers auto-clear: the inbox hides a row once none of those
 * lives are missing metrics any more (checked at read time — no cron needed, so
 * the badge drops the instant the streamer hits Save).
 */
export const userNotifications = pgTable(
  "user_notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g. "tiktok_incomplete_metrics"
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"), // where tapping the row goes
    sessionIds: text("session_ids").array(), // lives this covers (auto-clear)
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => ({
    inboxIdx: index("user_notifications_inbox_idx").on(t.userId, t.updatedAt),
    dedupeUniq: uniqueIndex("user_notifications_dedupe_uniq").on(
      t.userId,
      t.type,
      t.dedupeKey
    ),
  })
);
