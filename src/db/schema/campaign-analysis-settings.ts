import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { competitorStrategyEnum } from "./enums";
import { adAccounts } from "./ad-accounts";

/**
 * Configurable business-eligibility + strategy rules the Search Terms Analyzer
 * uses when classifying terms. Per account, optionally per campaign
 * (campaignExternalId NULL = the account-wide default). NOTHING is hardcoded —
 * the analyzer only knows what's stored here.
 */
export const campaignAnalysisSettings = pgTable(
  "campaign_analysis_settings",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    // "" = account-wide default; a campaign id = a per-campaign override. (Empty
    // string, not NULL, so the unique index below actually enforces one row per
    // key — Postgres treats NULLs as distinct.)
    campaignExternalId: text("campaign_external_id").notNull().default(""),

    servicesOffered: text("services_offered").array(),
    servicesNotOffered: text("services_not_offered").array(),
    supportedLocations: text("supported_locations").array(),
    unsupportedLocations: text("unsupported_locations").array(),
    acceptedEmploymentTypes: text("accepted_employment_types").array(),
    rejectedEmploymentTypes: text("rejected_employment_types").array(),
    acceptedSalaryMethods: text("accepted_salary_methods").array(),
    rejectedSalaryMethods: text("rejected_salary_methods").array(),
    minSalary: integer("min_salary"),

    competitorStrategy: competitorStrategyEnum("competitor_strategy")
      .notNull()
      .default("MONITOR"),
    mobileAppAvailable: boolean("mobile_app_available").notNull().default(false),
    onlineAppAvailable: boolean("online_app_available").notNull().default(true),

    // The advertiser's OWN brand/product names — always recognised as relevant
    // (brand protection: a brand term is never EXCLUDE'd).
    brandNames: text("brand_names").array(),
    productNames: text("product_names").array(),

    targetCostPerLeadMyr: numeric("target_cost_per_lead_myr", {
      precision: 14,
      scale: 2,
    }),
    highSpendThresholdMyr: numeric("high_spend_threshold_myr", {
      precision: 14,
      scale: 2,
    }),
    // Guardrails so a term isn't EXCLUDE'd on too little evidence.
    minClicksBeforeExclude: integer("min_clicks_before_exclude").notNull().default(5),
    minCostBeforeExcludeMyr: numeric("min_cost_before_exclude_myr", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("20"),

    ...timestamps(),
  },
  (t) => ({
    uq: unique("campaign_analysis_settings_uq").on(
      t.adAccountId,
      t.campaignExternalId
    ),
  })
);
