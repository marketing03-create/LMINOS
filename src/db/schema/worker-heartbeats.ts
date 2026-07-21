import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Liveness heartbeat for off-Vercel workers (the Fly TikTok connector). The
 * worker upserts `last_beat_at = now()` on every poll (~5 min); the dashboard
 * reads it to show a plain "tracker is running / may be down" status without
 * anyone touching flyctl. `name` is the singleton key per worker.
 */
export const workerHeartbeats = pgTable("worker_heartbeats", {
  name: text("name").primaryKey(),
  lastBeatAt: timestamp("last_beat_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  note: text("note"),
});
