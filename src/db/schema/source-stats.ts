import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Cached answers from the Finance Connect Source Statistics API (approved
 * loans + lead outcomes per marketing source). One row per request
 * (`key` = "from|to|platforms"); the Sales page reads it and refetches when
 * it is stale (lib/finance/source-stats.ts). Totals only — the API never
 * returns customer or staff details.
 */
export const sourceStatsCache = pgTable("source_stats_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});
