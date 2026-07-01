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
import { adSets, ads, campaigns } from "./campaigns";
import { id, timestamps } from "./columns";

export const adSpend = pgTable(
  "ad_spend",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    adSetId: uuid("ad_set_id").references(() => adSets.id, {
      onDelete: "set null",
    }),
    adId: uuid("ad_id").references(() => ads.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    platformLeadsReported: integer("platform_leads_reported")
      .notNull()
      .default(0),
    // Platform-reported conversions (e.g. Google Ads "Conversions"). Numeric
    // because Google reports fractional conversions. Compared against real
    // approved sales for the lead-quality view.
    conversions: numeric("conversions", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    // Platform-reported conversion VALUE. Stays 0 unless value tracking is
    // enabled in the ad platform; kept for forward-compat so enabling it later
    // needs no migration.
    conversionValue: numeric("conversion_value", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    ...timestamps(),
  },
  (t) => ({
    dateIdx: index("ad_spend_date_idx").on(t.date),
    campaignDateIdx: index("ad_spend_campaign_date_idx").on(
      t.campaignId,
      t.date
    ),
    // Single composite unique. NULLS NOT DISTINCT so two rows with
    // (campaign_id=X, ad_id=NULL, date=D) collide on duplicate import.
    uq: unique("ad_spend_uq")
      .on(t.adAccountId, t.campaignId, t.adSetId, t.adId, t.date)
      .nullsNotDistinct(),
  })
);
