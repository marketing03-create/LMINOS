import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { id, timestamps } from "./columns";
import { users } from "./users";
import { websites } from "./websites";

/**
 * A TikTok creator handle whose LIVE sessions LMIROS tracks. There's no official
 * TikTok API for live-room metrics, so a managed vendor (Apify / EnsembleData /
 * tik.tools) monitors the handle server-side and exposes finished sessions; the
 * cron sync pulls them into `tiktok_live_sessions`. brandId/websiteId are
 * nullable for a future linkage pass (V1 = raw metrics only).
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
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  websiteId: uuid("website_id").references(() => websites.id, {
    onDelete: "set null",
  }),
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
