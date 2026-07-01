import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { adAccounts } from "./ad-accounts";
import { id, timestamps } from "./columns";

/**
 * Hour-of-day performance (from Google Ads `segments.hour` + `segments.date`),
 * in the account's timezone. Powers the "golden hour" / best-time analysis —
 * aggregated by day-of-week × hour to find peak demand windows.
 * Idempotent on (account, date, hour).
 */
export const hourlyMetrics = pgTable(
  "hourly_metrics",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    hour: integer("hour").notNull(), // 0–23, account timezone
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    conversions: numeric("conversions", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    ...timestamps(),
  },
  (t) => ({
    uq: unique("hourly_metrics_uq").on(t.adAccountId, t.date, t.hour),
    acctDateIdx: index("hourly_metrics_acct_date_idx").on(t.adAccountId, t.date),
  })
);
