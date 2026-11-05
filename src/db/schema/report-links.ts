import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import { tiktokAccounts } from "./tiktok-accounts";

/**
 * A private CSV link to one TikTok handle's daily report, for a Google Sheet's
 * =IMPORTDATA(...) (no Google API). `/api/reports/sheet?key=<key>` answers
 * without a login, so the key IS the check: long, random, one per handle, and
 * replaceable from Admin → Integrations if it leaks. The CSV carries only
 * daily totals — no customer names or numbers.
 */
export const reportLinks = pgTable("report_links", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => tiktokAccounts.id, { onDelete: "cascade" }),
  key: text("key").notNull().unique(),
  // Last time the Sheet (or anyone with the link) fetched it.
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  ...timestamps(),
});
