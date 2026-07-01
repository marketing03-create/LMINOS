import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { nextActionEnum, rejectionReasonEnum } from "./enums";
import { leads } from "./leads";
import { users } from "./users";

export const rejectedLeads = pgTable(
  "rejected_leads",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),

    rejectedByAgentId: uuid("rejected_by_agent_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    rejectedAt: timestamp("rejected_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    rejectionReason: rejectionReasonEnum("rejection_reason").notNull(),

    recycleEligible: boolean("recycle_eligible").notNull().default(true),
    resaleEligible: boolean("resale_eligible").notNull().default(false),
    nextAction: nextActionEnum("next_action").notNull().default("recycle_later"),

    recycledAt: timestamp("recycled_at", { withTimezone: true }),
    recycledToLeadId: uuid("recycled_to_lead_id").references(
      (): AnyPgColumn => leads.id,
      { onDelete: "set null" }
    ),

    // Copies for fast filtering even if `leads` row changes
    snapshotBrandId: uuid("snapshot_brand_id"),
    snapshotLoanType: text("snapshot_loan_type"),
    snapshotLocationRegion: text("snapshot_location_region"),
    snapshotCampaignId: uuid("snapshot_campaign_id"),
    snapshotSourcePlatform: text("snapshot_source_platform"),

    notes: text("notes"),
    ...timestamps(),
  },
  (t) => ({
    reasonIdx: index("rejected_leads_reason_idx").on(t.rejectionReason),
    rejectedAtIdx: index("rejected_leads_rejected_at_idx").on(t.rejectedAt),
    recycleEligibleIdx: index("rejected_leads_recycle_eligible_idx").on(
      t.recycleEligible
    ),
    // One pool entry per lead — enables idempotent upsert from the Zoho sync.
    leadIdUq: uniqueIndex("rejected_leads_lead_id_uq").on(t.leadId),
  })
);
