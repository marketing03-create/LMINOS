import {
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import {
  leadStatusEnum,
  loanTypeEnum,
  matchConfidenceEnum,
} from "./enums";
import { leads } from "./leads";
import { users } from "./users";

export const salesRecords = pgTable(
  "sales_records",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),

    sheetRowId: text("sheet_row_id"),
    sheetName: text("sheet_name"),

    phoneNumberRaw: text("phone_number_raw"),
    normalizedPhone: text("normalized_phone"),
    emailRaw: text("email_raw"),
    normalizedEmail: text("normalized_email"),

    agentNameRaw: text("agent_name_raw"),
    agentId: uuid("agent_id").references(() => users.id, {
      onDelete: "set null",
    }),

    loanType: loanTypeEnum("loan_type"),
    salesStatus: leadStatusEnum("sales_status"),
    approvalStatus: text("approval_status"),

    salesAmount: numeric("sales_amount", { precision: 14, scale: 2 }),
    revenueValue: numeric("revenue_value", { precision: 14, scale: 2 }),

    closedDate: date("closed_date"),
    rejectionReason: text("rejection_reason"),
    remarks: text("remarks"),

    matchConfidence: matchConfidenceEnum("match_confidence")
      .notNull()
      .default("unmatched"),

    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    rawRow: jsonb("raw_row"),

    ...timestamps(),
  },
  (t) => ({
    normalizedPhoneIdx: index("sales_records_normalized_phone_idx").on(
      t.normalizedPhone
    ),
    leadIdIdx: index("sales_records_lead_id_idx").on(t.leadId),
    syncedAtIdx: index("sales_records_synced_at_idx").on(t.syncedAt),
    // Stable external row key (e.g. "zoho:<record_id>" / "<sheet>:<tab>:<row>")
    // — enables idempotent bulk upserts. Nullable: NULLs stay distinct.
    sheetRowIdUq: uniqueIndex("sales_records_sheet_row_id_uq").on(t.sheetRowId),
  })
);
