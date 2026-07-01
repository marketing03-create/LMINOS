import {
  index,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { users } from "./users";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => ({
    entityIdx: index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
  })
);
