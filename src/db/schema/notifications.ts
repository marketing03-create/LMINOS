import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import {
  notificationChannelEnum,
  notificationTypeEnum,
} from "./enums";
import { leads } from "./leads";
import { users } from "./users";

export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  type: notificationTypeEnum("type").notNull(),
  leadId: uuid("lead_id").references(() => leads.id, {
    onDelete: "cascade",
  }),
  channel: notificationChannelEnum("channel").notNull(),
  payload: jsonb("payload"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  ...timestamps(),
});
