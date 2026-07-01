import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { adAccounts } from "./ad-accounts";
import { adSets, ads, campaigns } from "./campaigns";
import { brands } from "./brands";
import { id, timestamps } from "./columns";
import {
  leadStatusEnum,
  loanTypeEnum,
  locationRegionEnum,
  priorityLevelEnum,
  sourcePlatformEnum,
} from "./enums";
import { teams } from "./teams";
import { users } from "./users";

export const leads = pgTable(
  "leads",
  {
    id: id(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    loanType: loanTypeEnum("loan_type").notNull(),

    fullName: text("full_name"),
    phoneNumberRaw: text("phone_number_raw"),
    // citext lives in the citext extension; declared as text and cast in SQL.
    normalizedPhone: text("normalized_phone"),
    emailRaw: text("email_raw"),
    normalizedEmail: text("normalized_email"),

    // Stable id from an external system-of-record (e.g. Zoho "Record ID").
    // Used to upsert the same source row idempotently instead of deduping it.
    externalRecordId: text("external_record_id"),

    sourcePlatform: sourcePlatformEnum("source_platform").notNull(),
    sourceChannel: text("source_channel"),
    landingPageUrl: text("landing_page_url"),
    keyword: text("keyword"),

    adAccountId: uuid("ad_account_id").references(() => adAccounts.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    adSetId: uuid("ad_set_id").references(() => adSets.id, {
      onDelete: "set null",
    }),
    adId: uuid("ad_id").references(() => ads.id, { onDelete: "set null" }),

    leadStatus: leadStatusEnum("lead_status").notNull().default("new"),
    priorityLevel: priorityLevelEnum("priority_level")
      .notNull()
      .default("warm"),
    locationRegion: locationRegionEnum("location_region")
      .notNull()
      .default("unknown"),

    assignedAgentId: uuid("assigned_agent_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedTeamId: uuid("assigned_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),

    masterLeadId: uuid("master_lead_id").references(
      (): AnyPgColumn => leads.id,
      { onDelete: "set null" }
    ),

    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    firstContactedAt: timestamp("first_contacted_at", { withTimezone: true }),
    slaBreachedAt: timestamp("sla_breached_at", { withTimezone: true }),

    rawPayload: jsonb("raw_payload"),
    notes: text("notes"),

    ...timestamps(),
  },
  (t) => ({
    normalizedPhoneIdx: index("leads_normalized_phone_idx").on(
      t.normalizedPhone
    ),
    normalizedEmailIdx: index("leads_normalized_email_idx").on(
      t.normalizedEmail
    ),
    brandSubmittedIdx: index("leads_brand_submitted_idx").on(
      t.brandId,
      t.submittedAt
    ),
    agentStatusIdx: index("leads_agent_status_idx").on(
      t.assignedAgentId,
      t.leadStatus
    ),
    campaignIdx: index("leads_campaign_idx").on(t.campaignId),
    masterLeadIdx: index("leads_master_lead_idx").on(t.masterLeadId),
    externalRecordIdx: uniqueIndex("leads_external_record_id_uq").on(
      t.externalRecordId
    ),
  })
);

export const leadTouchpoints = pgTable("lead_touchpoints", {
  id: id(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").references(() => brands.id, {
    onDelete: "set null",
  }),
  sourcePlatform: sourcePlatformEnum("source_platform").notNull(),
  campaignId: uuid("campaign_id").references(() => campaigns.id, {
    onDelete: "set null",
  }),
  adId: uuid("ad_id").references(() => ads.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  rawPayload: jsonb("raw_payload"),
  ...timestamps(),
});
