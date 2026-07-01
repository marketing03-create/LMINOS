import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

export const routingRules = pgTable("routing_rules", {
  id: id(),
  priority: integer("priority").notNull(),
  name: text("name").notNull(),
  // Conditions: { all: [{ field, op, value }, ...] }
  conditions: jsonb("conditions").notNull(),
  // Action: { type: 'assign_team', team_id, strategy: 'round_robin' }
  action: jsonb("action").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});
