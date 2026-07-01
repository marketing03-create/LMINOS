import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { adAccounts } from "./ad-accounts";
import { id, timestamps } from "./columns";

/**
 * Daily keyword performance (from Google Ads `keyword_view`). Flat/denormalized
 * — campaign + ad-group names stored inline — for a simple performance view
 * and to feed the AI analyst. Idempotent on (account, ad_group, criterion, date).
 */
export const keywordMetrics = pgTable(
  "keyword_metrics",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    campaignExternalId: text("campaign_external_id"),
    campaignName: text("campaign_name"),
    adGroupId: text("ad_group_id").notNull().default(""),
    adGroupName: text("ad_group_name"),
    criterionId: text("criterion_id").notNull(),
    keywordText: text("keyword_text").notNull(),
    matchType: text("match_type"),
    status: text("status"),
    date: date("date").notNull(),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    conversions: numeric("conversions", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    ...timestamps(),
  },
  (t) => ({
    uq: unique("keyword_metrics_uq").on(
      t.adAccountId,
      t.adGroupId,
      t.criterionId,
      t.date
    ),
    acctDateIdx: index("keyword_metrics_acct_date_idx").on(t.adAccountId, t.date),
  })
);

/**
 * Daily search-term performance (from `search_term_view`) — the actual queries
 * that triggered ads. The key source for finding wasted spend / negative
 * keyword candidates. Idempotent on (account, campaign, term, date).
 */
export const searchTerms = pgTable(
  "search_terms",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    campaignExternalId: text("campaign_external_id").notNull().default(""),
    campaignName: text("campaign_name"),
    term: text("term").notNull(),
    status: text("status"), // ADDED / EXCLUDED / NONE / ADDED_EXCLUDED
    date: date("date").notNull(),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    conversions: numeric("conversions", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    ...timestamps(),
  },
  (t) => ({
    uq: unique("search_terms_uq").on(
      t.adAccountId,
      t.campaignExternalId,
      t.term,
      t.date
    ),
    acctDateIdx: index("search_terms_acct_date_idx").on(t.adAccountId, t.date),
  })
);
