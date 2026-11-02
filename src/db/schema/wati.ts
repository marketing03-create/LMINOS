import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { tiktokAccounts } from "./tiktok-accounts";

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
  // Field names (never values) of the last body WATI sent — enough to see what
  // shape an unfamiliar event has without storing anyone's phone or text.
  lastEventKeys: text("last_event_keys").array(),
  // First time a CS reply event arrived. Until then reply tracking is off for
  // this account (WATI isn't sending "message sent" events), so a lead with no
  // reply means "unknown", not "ignored", and no missed-lead alert may fire.
  repliesSeenAt: timestamp("replies_seen_at", { withTimezone: true }),
  // Last missed-lead sweep — throttles the sweep the webhook runs to one per 5 min.
  missedCheckedAt: timestamp("missed_checked_at", { withTimezone: true }),
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
    // The customer's real first message, read from WATI's chat history — set
    // only when it is earlier than `firstMessageAt` (TT Stars only hears chats
    // from the day it was connected). A lead is counted for the live their
    // FIRST contact falls in, so a returning customer isn't a new lead again.
    // `firstMessageAt` stays "first message TT Stars saw": reply times run
    // from it. Null = no earlier history found.
    firstContactAt: timestamp("first_contact_at", { withTimezone: true }),
    // First human CS reply after their first message, and who sent it (WATI's
    // operator name/email). Null = not replied yet, or reply tracking is off.
    firstReplyAt: timestamp("first_reply_at", { withTimezone: true }),
    firstReplyBy: text("first_reply_by"),
    // When admins were alerted that this lead was waiting. Set once — a lead is
    // alerted about at most one time.
    missedAlertedAt: timestamp("missed_alerted_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => ({
    uq: uniqueIndex("whatsapp_contacts_uq").on(t.connectionId, t.phone),
    firstIdx: index("whatsapp_contacts_first_idx").on(t.firstMessageAt),
  })
);

/**
 * Which WATI account (and which of its numbers) carries a TikTok handle's
 * leads — one row per handle. This is what turns WhatsApp contacts into a
 * per-live lead count: a contact on this number whose first message lands in
 * one of the handle's live windows belongs to that live.
 *
 * `code` is an optional short word (e.g. "AIN") prefilled into the handle's
 * click-to-WhatsApp link. A first message containing it is credited to this
 * handle even when several handles share one number. `autoFillTotalLeads`
 * lets the 10am job write the WhatsApp count into a live's blank Total Leads.
 *
 * A separate table rather than columns on tiktok_accounts, so pages that read
 * tiktok_accounts never depend on this migration.
 */
export const tiktokWaLinks = pgTable(
  "tiktok_wa_links",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => tiktokAccounts.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => watiConnections.id, { onDelete: "cascade" }),
    // Digits only (60164328160). Null = any number on that WATI account.
    channelPhone: text("channel_phone"),
    code: text("code"),
    autoFillTotalLeads: boolean("auto_fill_total_leads").notNull().default(false),
    ...timestamps(),
  },
  (t) => ({
    codeUq: uniqueIndex("tiktok_wa_links_code_uq").on(t.code),
  })
);

/**
 * The daily cross-check (lib/wati/crosscheck.ts): for one WATI account and one
 * day, the new customers WATI shows messaging a linked number versus the ones
 * TT Stars received. One row per account per day; re-running overwrites it.
 *
 * `missing` keeps only what an admin needs to find the chat in WATI — last four
 * digits, name, when they first wrote, which number — never the full phone.
 */
export type CrossCheckMissing = { last4: string; name: string | null; at: string; number: string };

export const watiDailyChecks = pgTable(
  "wati_daily_checks",
  {
    id: id(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => watiConnections.id, { onDelete: "cascade" }),
    // WATI's "created" date of the contacts checked, YYYY-MM-DD.
    day: text("day").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    // New customers on WATI who messaged a linked number after TT Stars was connected.
    watiCustomers: integer("wati_customers").notNull().default(0),
    // Of those, how many TT Stars has.
    found: integer("found").notNull().default(0),
    missing: jsonb("missing").$type<CrossCheckMissing[]>().notNull().default([]),
    // New WATI contacts that aren't customer chats on a linked number (CS wrote
    // first, another number, or no chat) — shown so the totals add up.
    notCustomers: integer("not_customers").notNull().default(0),
    // Contacts left unchecked because the run hit its API-call cap.
    unchecked: integer("unchecked").notNull().default(0),
    // Why the check couldn't run (no API token, WATI refused…). Null = it ran.
    error: text("error"),
  },
  (t) => ({
    dayUq: uniqueIndex("wati_daily_checks_uq").on(t.connectionId, t.day),
  })
);
