import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import { userRoleEnum } from "./enums";

/**
 * Mirrors auth.users (id == auth.users.id).
 *
 * `team_id` and `daily_capacity` were sales-agent routing fields; they left with
 * the leads/sales features (migration 0030). A LMIROS user is now either an
 * admin or a live streamer.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // matches Supabase auth.users.id
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  role: userRoleEnum("role").notNull().default("viewer"),
  isActive: boolean("is_active").notNull().default(true),
  telegramChatId: text("telegram_chat_id"),
  ...timestamps(),
});
