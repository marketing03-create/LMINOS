import {
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { adAccounts } from "./ad-accounts";
import { id, timestamps } from "./columns";

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    externalCampaignId: text("external_campaign_id").notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
    status: text("status"),
    ...timestamps(),
  },
  (t) => ({
    adAcctCampaignUq: uniqueIndex("campaigns_ad_account_external_uq").on(
      t.adAccountId,
      t.externalCampaignId
    ),
  })
);

export const adSets = pgTable(
  "ad_sets",
  {
    id: id(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    externalAdSetId: text("external_ad_set_id").notNull(),
    name: text("name").notNull(),
    ...timestamps(),
  },
  (t) => ({
    campaignAdSetUq: uniqueIndex("ad_sets_campaign_external_uq").on(
      t.campaignId,
      t.externalAdSetId
    ),
  })
);

export const ads = pgTable(
  "ads",
  {
    id: id(),
    adSetId: uuid("ad_set_id")
      .notNull()
      .references(() => adSets.id, { onDelete: "cascade" }),
    externalAdId: text("external_ad_id").notNull(),
    name: text("name").notNull(),
    creativeId: text("creative_id"),
    creativeUrl: text("creative_url"),
    ...timestamps(),
  },
  (t) => ({
    adSetAdUq: uniqueIndex("ads_ad_set_external_uq").on(
      t.adSetId,
      t.externalAdId
    ),
  })
);
