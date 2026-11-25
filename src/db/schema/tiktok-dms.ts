import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { tiktokAccounts } from "./tiktok-accounts";
import { watiConnections } from "./wati";

/**
 * TikTok DMs that reach TT Stars through WATI (WATI can connect a TikTok
 * account; its DMs arrive on the same account webhook as WhatsApp). Kept apart
 * from the WhatsApp tables on purpose: WhatsApp numbers, counts, cross-checks
 * and reports stay exactly as they were, and a DM never counts as a WhatsApp
 * lead. lib/wati/tiktok.ts writes these; payload rules in tiktok-core.ts.
 */

/** One TikTok account connected in a WATI account (WATI's channelId), and the TT Stars handle it belongs to. */
export const tiktokDmChannels = pgTable(
  "tiktok_dm_channels",
  {
    id: id(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => watiConnections.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    // The TikTok handle these DMs belong to — set automatically when WATI names
    // it, otherwise by an admin on Integrations. Null = not linked yet.
    accountId: uuid("account_id").references(() => tiktokAccounts.id, { onDelete: "set null" }),
    // What WATI calls the channel (its name or the TikTok username), if it says.
    label: text("label"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => ({ uq: unique("tiktok_dm_channels_uq").on(t.connectionId, t.channelId) })
);

/** One TikTok user who DM'd one channel. A DM has no phone number: `senderId` is TikTok's id for them. */
export const tiktokDmContacts = pgTable(
  "tiktok_dm_contacts",
  {
    id: id(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => watiConnections.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    senderId: text("sender_id").notNull(),
    name: text("name"),
    firstMessageAt: timestamp("first_message_at", { withTimezone: true }).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    firstMessageText: text("first_message_text"),
    latestMessageText: text("latest_message_text"),
    latestMessageAt: timestamp("latest_message_at", { withTimezone: true }),
    // "customer" | "cs"
    latestMessageFrom: text("latest_message_from"),
    firstReplyAt: timestamp("first_reply_at", { withTimezone: true }),
    firstReplyBy: text("first_reply_by"),
    watiConversationId: text("wati_conversation_id"),
    ...timestamps(),
  },
  (t) => ({
    uq: unique("tiktok_dm_contacts_uq").on(t.connectionId, t.channelId, t.senderId),
    firstIdx: index("tiktok_dm_contacts_first_idx").on(t.firstMessageAt),
  })
);

/** That a TikTok user wrote on a Malaysia day — the DM version of whatsapp_chat_days. */
export const tiktokDmDays = pgTable(
  "tiktok_dm_days",
  {
    id: id(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => tiktokDmContacts.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    firstAt: timestamp("first_at", { withTimezone: true }).notNull(),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => ({
    uq: unique("tiktok_dm_days_uq").on(t.contactId, t.day),
    dayIdx: index("tiktok_dm_days_day_idx").on(t.day),
  })
);

/**
 * Webhook bodies TT Stars couldn't read as a WhatsApp message or a TikTok DM —
 * field names and value TYPES only (never values), one row per shape, so a new
 * WATI format (e.g. the first TikTok DM) can be supported without guessing.
 */
export const watiUnknownEvents = pgTable(
  "wati_unknown_events",
  {
    id: id(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => watiConnections.id, { onDelete: "cascade" }),
    signature: text("signature").notNull(),
    eventType: text("event_type"),
    shape: jsonb("shape").notNull(),
    count: integer("count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  },
  (t) => ({ uq: unique("wati_unknown_events_uq").on(t.connectionId, t.signature) })
);
