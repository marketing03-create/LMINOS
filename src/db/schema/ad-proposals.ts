import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import {
  adProposalRiskEnum,
  adProposalStatusEnum,
  adProposalTypeEnum,
} from "./enums";
import { adAccounts } from "./ad-accounts";
import { websites } from "./websites";
import { users } from "./users";

/**
 * AI Google Ads co-pilot — one row per change Claude proposes for an account
 * (Feature L, pillars 3–4). The proposal is data-grounded and READ-only to
 * Google: it lives in our DB and a human approves/rejects it. `payload` holds
 * the exact intended mutation so that when Google grants Basic (write) access,
 * the apply layer (pillar 5) can execute an approved proposal one-click, and
 * `beforeSnapshot` enables a future one-click revert. Until then "approved"
 * means "apply this by hand in Google Ads".
 */
export const adProposals = pgTable(
  "ad_proposals",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccounts.id, { onDelete: "cascade" }),
    // Context only (the account already carries the website slug). Nullable.
    websiteId: uuid("website_id").references(() => websites.id, {
      onDelete: "set null",
    }),
    type: adProposalTypeEnum("type").notNull(),
    status: adProposalStatusEnum("status").notNull().default("pending"),
    riskTier: adProposalRiskEnum("risk_tier").notNull().default("low"),
    // Human-readable subject of the change (keyword text / search term / campaign).
    target: text("target"),
    // What to do, in plain words (shown on the card).
    change: text("change").notNull(),
    rationale: text("rationale").notNull(),
    projectedImpact: text("projected_impact"),
    // Data-confidence the model assigned: "low" | "medium" | "high".
    confidence: text("confidence"),
    // Exact intended mutation, for the future apply layer (pillar 5).
    payload: jsonb("payload"),
    // Prior value(s), captured at apply time — for a future one-click revert.
    beforeSnapshot: jsonb("before_snapshot"),
    modelUsed: text("model_used"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps(),
  },
  (t) => ({
    accountStatusIdx: index("ad_proposals_account_status_idx").on(
      t.adAccountId,
      t.status
    ),
    statusCreatedIdx: index("ad_proposals_status_created_idx").on(
      t.status,
      t.createdAt
    ),
  })
);
