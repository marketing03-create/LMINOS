import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

export const brands = pgTable("brands", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});
