import {
  boolean,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import { userRoleEnum } from "./enums";
import { teams } from "./teams";

// Mirrors auth.users (id == auth.users.id).
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // matches Supabase auth.users.id
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  role: userRoleEnum("role").notNull().default("sales_agent"),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  telegramChatId: text("telegram_chat_id"),
  dailyCapacity: integer("daily_capacity").notNull().default(50),
  ...timestamps(),
});
