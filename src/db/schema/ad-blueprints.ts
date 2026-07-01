import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import {
  adBlueprintRiskEnum,
  adBlueprintStatusEnum,
  adBuildStepKindEnum,
  adBuildStepStatusEnum,
} from "./enums";
import { adAccounts } from "./ad-accounts";
import { websites } from "./websites";
import { users } from "./users";

/**
 * AI Google Ads Account Builder — one row per whole-account plan the AI drafts
 * (Feature R). The `blueprint` jsonb holds the full tree (account → campaigns →
 * ad groups → keywords/negatives → ads), validated by BLUEPRINT_SCHEMA. A human
 * reviews/edits/approves it; the apply layer then builds it via the Google Ads
 * REST `:mutate` API. Like Feature L's ad_proposals, the live build is DARK
 * until Google grants Basic (write) access — until then the blueprint can be
 * drafted, edited, and dry-run-validated against Google, then applied by hand.
 *
 * Built campaigns are created PAUSED, so a build never spends — going live is a
 * separate, explicit un-pause.
 */
export const adBlueprints = pgTable(
  "ad_blueprints",
  {
    id: id(),
    // The existing account this builds INTO (user's chosen flow: human creates
    // + verifies the shell, LMIROS builds the campaigns inside). Nullable until
    // linked / for the deferred API-create path.
    adAccountId: uuid("ad_account_id").references(() => adAccounts.id, {
      onDelete: "set null",
    }),
    websiteId: uuid("website_id").references(() => websites.id, {
      onDelete: "set null",
    }),
    // "existing" (build into a human-created account) | "api_create" (deferred).
    accountSource: text("account_source").notNull().default("existing"),
    status: adBlueprintStatusEnum("status").notNull().default("draft"),
    riskTier: adBlueprintRiskEnum("risk_tier").notNull().default("high"),
    title: text("title").notNull(),
    // The full validated blueprint tree (BLUEPRINT_SCHEMA shape).
    blueprint: jsonb("blueprint").notNull(),
    // Summed planned daily budget (MYR) — a guardrail the server re-checks.
    dailyBudgetMyr: numeric("daily_budget_myr"),
    rationale: text("rationale"),
    modelUsed: text("model_used"),
    // The live Google customer id once known/linked.
    externalCustomerId: text("external_customer_id"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // Last successful dry-run validate (all steps validated) — drives the
    // "build requires a fresh validate" guardrail + UI freshness.
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    builtAt: timestamp("built_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps(),
  },
  (t) => ({
    statusCreatedIdx: index("ad_blueprints_status_created_idx").on(
      t.status,
      t.createdAt
    ),
    accountIdx: index("ad_blueprints_account_idx").on(t.adAccountId),
  })
);

/**
 * One ordered Google Ads `:mutate` operation belonging to a blueprint. Stored
 * as rows (not just inside the blueprint jsonb) so the reviewer + the dry-run
 * see the exact ordered operations, partial failures are recoverable, and each
 * created resource's `resourceName` is captured for a reverse-order teardown.
 */
export const adBuildSteps = pgTable(
  "ad_build_steps",
  {
    id: id(),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => adBlueprints.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(), // execution order
    kind: adBuildStepKindEnum("kind").notNull(),
    status: adBuildStepStatusEnum("status").notNull().default("pending"),
    // The single mutate operation in REST shape (with temp resource names).
    requestPayload: jsonb("request_payload").notNull(),
    // Google's returned resource string (for revert/teardown).
    resourceName: text("resource_name"),
    responsePayload: jsonb("response_payload"),
    error: text("error"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => ({
    blueprintSeqIdx: index("ad_build_steps_blueprint_seq_idx").on(
      t.blueprintId,
      t.seq
    ),
  })
);
