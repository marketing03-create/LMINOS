import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tombstone list of users an admin removed. LMIROS auto-provisions users from
 * external sources (mainly the Zoho sheet's "Assigned To" agents, re-created on
 * every 10-minute sync). Without this, removing an agent was pointless — the
 * next sync saw their name in the sheet and re-created the row, so they kept
 * coming back. The removal path records the email here; every auto-provisioner
 * checks it and skips a suppressed email. Re-adding a user via "Add user"
 * clears their tombstone (an explicit, intentional re-invite).
 *
 * Keyed by lowercased email (the deterministic synthetic `agentEmail(name)` for
 * Zoho agents, or the real login email for SSO users).
 */
export const removedUsers = pgTable("removed_users", {
  email: text("email").primaryKey(),
  removedAt: timestamp("removed_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  removedByUserId: uuid("removed_by_user_id"),
  note: text("note"),
});
