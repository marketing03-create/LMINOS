import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { users } from "./users";

/**
 * A TikTok creator handle whose LIVE sessions LMIROS tracks. There's no official
 * TikTok API for live-room metrics, so a self-hosted connector (and optionally a
 * managed vendor) monitors the handle and exposes finished sessions; the sync
 * pulls them into `tiktok_live_sessions`.
 *
 * The old `brand_id` / `website_id` columns were placeholders for a linkage that
 * never shipped, and their targets moved to Adrify — dropped in migration 0030.
 */
export const tiktokAccounts = pgTable("tiktok_accounts", {
  id: id(),
  // The @username (stored without the leading "@"). Unique = one row per creator.
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  // Lead-trigger keywords: a viewer who comments one of these during a live is
  // counted as a lead (e.g. ["lend","loan","pinjaman","apply"]). Null/empty →
  // the connector falls back to a sensible default list.
  leadKeywords: text("lead_keywords").array(),
  // The live-streamer user in charge of this handle (Feature U). A streamer
  // login only sees/uploads sessions for handles assigned to them. Nullable =
  // no streamer assigned (admins manage it either way).
  assignedStreamerId: uuid("assigned_streamer_id").references(() => users.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  notes: text("notes"),
  ...timestamps(),
});
