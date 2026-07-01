import { google, type sheets_v4 } from "googleapis";

let cached: sheets_v4.Sheets | null = null;

/**
 * Service-account-authenticated Google Sheets client.
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_JSON_B64 — base64-encoded JSON key for a
 *      service account that has been granted *Viewer* access on each
 *      target spreadsheet.
 */
export function getSheetsClient(): sheets_v4.Sheets {
  if (cached) return cached;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  if (!b64) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_B64 not configured");
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch (err) {
    throw new Error(
      `failed to decode GOOGLE_SERVICE_ACCOUNT_JSON_B64: ${
        err instanceof Error ? err.message : err
      }`
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  cached = google.sheets({ version: "v4", auth });
  return cached;
}

/**
 * Read the entire data range of a tab.
 * Range omits a column upper-bound so any number of columns are returned.
 * Returns the raw 2-D array exactly as Sheets returns it (no header parsing).
 */
export async function fetchTabValues(
  sheetId: string,
  tabName: string
): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    // 'A1:ZZ' wide enough for any practical sheet.
    range: `${tabName}!A1:ZZ`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return (res.data.values ?? []) as string[][];
}
