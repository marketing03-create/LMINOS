import {
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { leads } from "./leads";
import { users } from "./users";

export const assignmentsHistory = pgTable(
  "assignments_history",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    fromAgentId: uuid("from_agent_id").references(() => users.id, {
      onDelete: "set null",
    }),
    toAgentId: uuid("to_agent_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => ({
    leadIdx: index("assignments_history_lead_idx").on(t.leadId),
  })
);
