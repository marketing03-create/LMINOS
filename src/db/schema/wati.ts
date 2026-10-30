import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

/**
 * One row per WATI account (WhatsApp Business API inbox) connected to TT Stars.
 * WATI calls `/api/webhooks/wati/<webhookKey>` on every event; the key in the
 * path is the only proof a call came from that account — WATI does not sign its
 * webhooks — so it is long, random, and never shown to anyone but admins.
 *
 * `apiEndpoint` + `apiTokenEnc` are WATI's own API (Dashboard → API Docs), kept
 * for pulling contacts and, later, sending. The token is envelope-encrypted with
 * ENCRYPTION_KEY (lib/crypto/envelope.ts). Both optional: the webhook alone is
 * enough to count leads.
 */
export const watiConnections = pgTable("wati_connections", {
  id: id(),
  name: text("name").notNull(),
  webhookKey: text("webhook_key").notNull().unique(),
  apiEndpoint: text("api_endpoint"),
  apiTokenEnc: text("api_token_enc"),
  isActive: boolean("is_active").notNull().default(true),
  // Last call WATI made to the webhook, of any event type — what turns the
  // admin card from "waiting" to "connected" after WATI's sample callback.
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  lastEventType: text("last_event_type"),
  ...timestamps(),
});

/**
 * One row per customer phone per WATI account — the deduped lead list. A lead
 * is a person, not a message (see tiktok_live_sessions.total_leads), so every
 * message from the same phone lands on the same row: `firstMessageAt` is when
 * they first reached us, which is what a live's lead count is windowed on.
 *
 * `phone` is digits only in international form (60123456789), so "012…" and
 * "+6012…" are the same row. `firstMessageText` keeps the opening message
 * (truncated) because a click-to-WhatsApp link can prefill a live/streamer code
 * there — the attribution hook for a later phase.
 */
export const whatsappContacts = pgTable(
  "whatsapp_contacts",
  {
    id: id(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => watiConnections.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name"),
    // The business number the customer messaged (WATI's channelPhoneNumber) —
    // tells numbers apart when one WATI account has several.
    channelPhone: text("channel_phone"),
    firstMessageAt: timestamp("first_message_at", { withTimezone: true }).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    firstMessageText: text("first_message_text"),
    ...timestamps(),
  },
  (t) => ({
    uq: uniqueIndex("whatsapp_contacts_uq").on(t.connectionId, t.phone),
    firstIdx: index("whatsapp_contacts_first_idx").on(t.firstMessageAt),
  })
);
