import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { users } from "./users";

/**
 * One row per phone/browser that said yes to LMIROS notifications (Web Push).
 * A person can have several (phone + laptop). `endpoint` is the push service's
 * address for that device and is globally unique; `p256dh` + `auth` are the
 * keys the payload is encrypted with. A device that uninstalls or revokes
 * permission answers 404/410 on the next send, and the row is deleted then.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    ...timestamps(),
  },
  (t) => ({
    endpointUniq: uniqueIndex("push_subscriptions_endpoint_uniq").on(t.endpoint),
    userIdx: index("push_subscriptions_user_idx").on(t.userId),
  })
);
