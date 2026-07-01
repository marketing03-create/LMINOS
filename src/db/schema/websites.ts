import {
  boolean,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { id, timestamps } from "./columns";
import { users } from "./users";

/**
 * A website is the stable hub that ties together: the (rotating) ad accounts
 * that drive traffic to it, the pool of agents who work its leads, and the
 * leads themselves (matched by slug = leads.source_channel = ad_accounts.website).
 * Ad accounts get suspended/replaced over time, but the website — and therefore
 * its performance history — stays continuous.
 */
export const websites = pgTable("websites", {
  id: id(),
  // Canonical key: equals the Zoho "Website" value, ad_accounts.website, and
  // leads.source_channel. The slug is how everything joins to this website.
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  brandId: uuid("brand_id").references(() => brands.id, {
    onDelete: "set null",
  }),
  whatsappNumber: text("whatsapp_number"),
  status: text("status").notNull().default("active"), // active / paused
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  ...timestamps(),
});

/** Agent pool per website (many-to-many). Leads belong to the pool, not one owner. */
export const websiteAgents = pgTable(
  "website_agents",
  {
    id: id(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => ({
    uq: uniqueIndex("website_agents_uq").on(t.websiteId, t.userId),
  })
);
