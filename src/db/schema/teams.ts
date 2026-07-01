import {
  boolean,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { loanTypeEnum } from "./enums";

export const teams = pgTable("teams", {
  id: id(),
  name: text("name").notNull(),
  loanTypes: loanTypeEnum("loan_types").array().notNull().default([]),
  brandIds: uuid("brand_ids").array().notNull().default([]),
  telegramGroupId: text("telegram_group_id"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});
