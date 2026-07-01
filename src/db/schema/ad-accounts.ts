import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { id, timestamps } from "./columns";
import { adAccountStatusEnum, platformEnum } from "./enums";
import { websites } from "./websites";

export const adAccounts = pgTable(
  "ad_accounts",
  {
    id: id(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    platform: platformEnum("platform").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    displayName: text("display_name").notNull(),
    // Which website this ad account drives traffic to (matches the value in
    // leads.source_channel, e.g. "flexi_fund_capital"). Lets ROAS attribute
    // spend to a website when there's one ad account per website. Kept in sync
    // with websites.slug; websiteId is the relational link to the hub.
    website: text("website"),
    websiteId: uuid("website_id").references(() => websites.id, {
      onDelete: "set null",
    }),
    // Lifecycle: accounts get suspended by the platform and replaced by a new
    // one under the same website. History stays; ROAS is continuous per website.
    status: adAccountStatusEnum("status").notNull().default("active"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    replacedByAccountId: uuid("replaced_by_account_id"),
    accessTokenEncrypted: text("access_token_encrypted"),
    // The Gmail that owns/can-read this account — used to pre-select the right
    // account at OAuth (login_hint) and to authorize all accounts under one
    // Gmail in a single sign-in (bulk import).
    owningEmail: text("owning_email"),
    webhookSecret: text("webhook_secret"),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => ({
    platformExternalAccountUq: uniqueIndex(
      "ad_accounts_platform_external_account_uq"
    ).on(t.platform, t.externalAccountId),
  })
);
