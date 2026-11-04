import {
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
import { tiktokLiveSessions } from "./tiktok-live-sessions";
import { users } from "./users";

/**
 * The Google service account TT Stars uses to make customer folders in the
 * handles' Shared Drives and count the files streamers upload. One row — saving
 * a new key replaces it. The private key is envelope-encrypted with
 * ENCRYPTION_KEY (lib/crypto/envelope.ts), like the WATI token.
 */
export const driveSettings = pgTable("drive_settings", {
  id: id(),
  clientEmail: text("client_email").notNull(),
  privateKeyEnc: text("private_key_enc").notNull(),
  ...timestamps(),
});

/**
 * Which Shared Drive holds a TikTok handle's customer documents — one row per
 * handle. Each handle gets its own Shared Drive so a streamer, added only to
 * theirs, can never open another handle's customers.
 */
export const tiktokDriveLinks = pgTable("tiktok_drive_links", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => tiktokAccounts.id, { onDelete: "cascade" }),
  sharedDriveId: text("shared_drive_id").notNull(),
  // As Google named it when the link was saved — for the admin card.
  sharedDriveName: text("shared_drive_name"),
  ...timestamps(),
});

/**
 * The "2026-11-04" folder in a Shared Drive that the day's customer folders go
 * in. Kept so two customers created at the same moment can't make two folders
 * for one day (creation runs under an advisory lock on drive + day).
 */
export const driveDayFolders = pgTable(
  "drive_day_folders",
  {
    id: id(),
    sharedDriveId: text("shared_drive_id").notNull(),
    // Malaysia date, YYYY-MM-DD.
    day: text("day").notNull(),
    folderId: text("folder_id").notNull(),
    ...timestamps(),
  },
  (t) => ({
    uq: uniqueIndex("drive_day_folders_uq").on(t.sharedDriveId, t.day),
  })
);

/** Files counted per document type in one customer's folder. */
export type CustomerFileCounts = {
  ic: number;
  payslip: number;
  bankStatement: number;
  // Files dropped straight into the customer folder, outside the three.
  other: number;
};

/** Drive folder ids of the three document subfolders. */
export type CustomerSubfolders = { ic: string; payslip: string; bankStatement: string };

/**
 * One customer who is sending documents — a folder in the handle's Shared
 * Drive with IC / Payslip / Bank Statement inside. A customer with at least one
 * file is a "Document Collect" for the live they came from.
 *
 * One row per phone per handle: creating the same phone again opens the
 * existing folder. `folderId` is null only while the folders are being made.
 */
export const customerFolders = pgTable(
  "customer_folders",
  {
    id: id(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tiktokAccounts.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => tiktokLiveSessions.id, {
      onDelete: "set null",
    }),
    customerName: text("customer_name").notNull(),
    // Digits, international form (60123456789) — same as whatsapp_contacts.
    phone: text("phone").notNull(),
    sharedDriveId: text("shared_drive_id").notNull(),
    folderId: text("folder_id"),
    subfolders: jsonb("subfolders").$type<CustomerSubfolders>(),
    fileCounts: jsonb("file_counts").$type<CustomerFileCounts>(),
    totalFiles: integer("total_files").notNull().default(0),
    filesCheckedAt: timestamp("files_checked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => ({
    phoneUq: uniqueIndex("customer_folders_phone_uq").on(t.accountId, t.phone),
  })
);
