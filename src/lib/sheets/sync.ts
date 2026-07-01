import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { salesRecords, sheetSyncState } from "@/db/schema";
import { enqueueSalesMatch } from "@/lib/queue/queues";
import { fetchTabValues } from "./client";
import {
  columnMappingSchema,
  parseSalesRow,
  resolveHeaderMap,
} from "./parse";

export type SyncResult = {
  sheetId: string;
  tabName: string;
  rowsFetched: number;
  rowsConsidered: number;
  inserted: number;
  errors: { row: number; error: string }[];
  newCursor: number;
  durationMs: number;
};

/**
 * Sync a single sheet+tab. Inserts new rows into sales_records,
 * advances last_row_synced, and enqueues sales.match for each inserted id.
 * Caller is responsible for catching errors and writing them to last_error.
 */
export async function syncOneTab(state: {
  id: string;
  sheetId: string;
  tabName: string;
  columnMapping: unknown;
  lastRowSynced: number;
}): Promise<SyncResult> {
  const t0 = Date.now();
  const values = await fetchTabValues(state.sheetId, state.tabName);
  const errors: { row: number; error: string }[] = [];

  // Empty sheet or only header — nothing to do.
  if (values.length < 2) {
    return {
      sheetId: state.sheetId,
      tabName: state.tabName,
      rowsFetched: values.length,
      rowsConsidered: 0,
      inserted: 0,
      errors,
      newCursor: state.lastRowSynced,
      durationMs: Date.now() - t0,
    };
  }

  const headerRow = values[0];
  const mapping = columnMappingSchema.parse(state.columnMapping ?? null);
  const headerMap = resolveHeaderMap(headerRow, mapping ?? undefined);

  // We treat last_row_synced as "highest data row already processed" (1-indexed
  // including header). So we start at lastRowSynced + 1 if lastRowSynced >= 2,
  // else at row 2 (the first data row).
  const startRow = Math.max(state.lastRowSynced + 1, 2);
  const insertedIds: string[] = [];

  for (let r = startRow; r <= values.length; r++) {
    const row = values[r - 1] ?? [];
    if (row.every((c) => c == null || String(c).trim() === "")) {
      continue; // skip blank rows entirely
    }
    const parsed = parseSalesRow(row, r, headerMap, headerRow);
    if (!parsed.ok) {
      errors.push({ row: r, error: parsed.error });
      continue;
    }

    const [inserted] = await db
      .insert(salesRecords)
      .values({
        sheetRowId: `${state.sheetId}:${state.tabName}:${r}`,
        sheetName: `${state.tabName}`,
        phoneNumberRaw: parsed.data.phoneRaw,
        normalizedPhone: parsed.data.normalizedPhone,
        emailRaw: parsed.data.emailRaw,
        normalizedEmail: parsed.data.normalizedEmail,
        agentNameRaw: parsed.data.agentNameRaw,
        loanType: parsed.data.loanType as never, // raw text; matcher tolerates
        salesStatus: (parsed.data.salesStatus ?? null) as never,
        approvalStatus: parsed.data.approvalStatus,
        salesAmount: parsed.data.salesAmount,
        revenueValue: parsed.data.revenueValue,
        closedDate: parsed.data.closedDate,
        rejectionReason: parsed.data.rejectionReason,
        remarks: parsed.data.remarks,
        matchConfidence: "unmatched",
        syncedAt: new Date(),
        rawRow: parsed.data.rawRow,
      })
      .returning({ id: salesRecords.id });

    insertedIds.push(inserted.id);
  }

  await db
    .update(sheetSyncState)
    .set({
      lastRowSynced: values.length,
      lastSyncedAt: new Date(),
      lastError: errors.length > 0 ? `${errors.length} row error(s)` : null,
    })
    .where(eq(sheetSyncState.id, state.id));

  // Enqueue matcher for every inserted row.
  for (const id of insertedIds) {
    try {
      await enqueueSalesMatch({ salesRecordId: id });
    } catch (err) {
      console.error(`[sheets.sync] enqueue sales.match failed for ${id}:`, err);
    }
  }

  return {
    sheetId: state.sheetId,
    tabName: state.tabName,
    rowsFetched: values.length,
    rowsConsidered: values.length - startRow + 1,
    inserted: insertedIds.length,
    errors,
    newCursor: values.length,
    durationMs: Date.now() - t0,
  };
}

/**
 * Run syncOneTab for every active tab in sheet_sync_state.
 * Tab failures are isolated: one bad tab does not stop others.
 */
export async function syncAllTabs(): Promise<{
  ok: boolean;
  results: (SyncResult | { sheetId: string; tabName: string; error: string })[];
}> {
  const tabs = await db.select().from(sheetSyncState);
  const results: (
    | SyncResult
    | { sheetId: string; tabName: string; error: string }
  )[] = [];

  for (const tab of tabs) {
    try {
      const r = await syncOneTab({
        id: tab.id,
        sheetId: tab.sheetId,
        tabName: tab.tabName,
        columnMapping: tab.columnMapping,
        lastRowSynced: tab.lastRowSynced,
      });
      results.push(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(sheetSyncState)
        .set({
          lastError: message.slice(0, 1000),
          lastSyncedAt: new Date(),
        })
        .where(eq(sheetSyncState.id, tab.id));
      results.push({ sheetId: tab.sheetId, tabName: tab.tabName, error: message });
      console.error(
        `[sheets.sync] tab ${tab.sheetId}:${tab.tabName} failed:`,
        message
      );
    }
  }

  return { ok: true, results };
}

// keep import used by ESLint
void sql;
