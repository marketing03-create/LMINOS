/**
 * Zoho Sheet Data API v2 client.
 *
 * Reads rows from a worksheet via `worksheet.records.fetch`.
 * https://www.zoho.com/sheet/help/api/v2/
 *
 * The worksheet's first row is treated as column headers; each returned
 * record is an object keyed by header name, plus a numeric `row_index`.
 */
import { getZohoAccessToken } from "./auth";

export type ZohoRecord = Record<string, string | number | null> & {
  row_index: number;
};

function sheetBase(): string {
  return process.env.ZOHO_SHEET_DOMAIN ?? "https://sheet.zoho.com";
}

/**
 * Fetch a page of records from a worksheet.
 * `count` max per Zoho is typically 1000; we page with startIndex.
 */
async function fetchPage(
  resourceId: string,
  worksheetName: string,
  startIndex: number,
  count: number
): Promise<ZohoRecord[]> {
  const token = await getZohoAccessToken();

  // Per Zoho's CORS guidance, `method` goes in the query string and the rest
  // in the form body.
  const url = `${sheetBase()}/api/v2/${encodeURIComponent(
    resourceId
  )}?method=worksheet.records.fetch`;

  const body = new URLSearchParams({
    worksheet_name: worksheetName,
    // Zoho's start-index param is `records_start_index` (plural). With the
    // wrong name Zoho ignores paging and returns page 1 forever — the caller
    // also guards against that by deduping on row_index.
    records_start_index: String(startIndex),
    count: String(count),
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = (await res.json()) as {
    status?: string;
    records?: ZohoRecord[];
    error_message?: string;
    error_code?: string | number;
  };

  if (!res.ok || json.status !== "success") {
    throw new Error(
      `Zoho fetch failed: HTTP ${res.status} ${
        json.error_message ?? json.error_code ?? JSON.stringify(json).slice(0, 200)
      }`
    );
  }
  return json.records ?? [];
}

/**
 * Fetch ALL records from a worksheet, paging until exhausted.
 * Guarded by a hard cap so a misconfiguration can't loop forever.
 */
export async function fetchAllZohoRecords(
  resourceId: string,
  worksheetName: string,
  opts: { pageSize?: number; maxRecords?: number } = {}
): Promise<ZohoRecord[]> {
  const pageSize = opts.pageSize ?? 1000;
  const maxRecords = opts.maxRecords ?? 50_000;
  const all: ZohoRecord[] = [];
  let start = 1; // Zoho row indices are 1-based; row 1 is the header.

  // Track seen row_index so a stuck pagination (wrong start param) can't loop
  // the same page forever — we stop as soon as a page brings nothing new.
  const seen = new Set<number>();
  while (all.length < maxRecords) {
    const page = await fetchPage(resourceId, worksheetName, start, pageSize);
    if (page.length === 0) break;

    let added = 0;
    let maxRow = start;
    for (const r of page) {
      const idx = typeof r.row_index === "number" ? r.row_index : -1;
      if (idx >= 0) maxRow = Math.max(maxRow, idx);
      if (idx >= 0 && seen.has(idx)) continue;
      if (idx >= 0) seen.add(idx);
      all.push(r);
      added++;
    }

    if (added === 0) break; // exhausted, or pagination stuck on a repeat page
    if (page.length < pageSize) break; // last (short) page
    start = maxRow + 1;
  }

  return all;
}
