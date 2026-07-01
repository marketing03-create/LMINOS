import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

export const sheetSyncState = pgTable(
  "sheet_sync_state",
  {
    id: id(),
    sheetId: text("sheet_id").notNull(),
    tabName: text("tab_name").notNull(),
    // Maps logical field → source column header. e.g. { "normalized_phone": "Phone" }
    columnMapping: jsonb("column_mapping"),
    lastRowSynced: integer("last_row_synced").notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps(),
  },
  (t) => ({
    sheetTabUq: uniqueIndex("sheet_sync_state_sheet_tab_uq").on(
      t.sheetId,
      t.tabName
    ),
  })
);
