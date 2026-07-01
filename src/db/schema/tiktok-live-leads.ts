import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { tiktokAccounts } from "./tiktok-accounts";
import { tiktokLiveSessions } from "./tiktok-live-sessions";

/**
 * One row per viewer who commented a lead keyword (e.g. "LEND") during a live —
 * the PM worklist + the live's lead count. Captured by the self-hosted
 * connector. Unique on (sessionId, username): one lead per viewer per live
 * (re-comments don't inflate the count).
 */
export const tiktokLiveLeads = pgTable(
  "tiktok_live_leads",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => tiktokLiveSessions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tiktokAccounts.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    commentText: text("comment_text"),
    commentedAt: timestamp("commented_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => ({
    uq: uniqueIndex("tiktok_live_leads_uq").on(t.sessionId, t.username),
    sessionIdx: index("tiktok_live_leads_session_idx").on(t.sessionId),
  })
);
