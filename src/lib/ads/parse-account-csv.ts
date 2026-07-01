/**
 * Pure CSV parsing for bulk ad-account import (no DB import, so it's unit
 * testable). Columns (header row, flexible names):
 *   customer_id (required) · display_name · website · owning_gmail
 */
import Papa from "papaparse";

export type ParsedAccountRow = {
  line: number;
  customerId: string;
  displayName: string;
  website: string | null;
  owningEmail: string | null;
  error?: string;
};

/** Keep digits only — "123-456-7890" → "1234567890". */
function digits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Read a value by any of several normalized header aliases. */
function pick(raw: Record<string, unknown>, aliases: string[]): string {
  for (const key of Object.keys(raw)) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (aliases.includes(norm)) return String(raw[key] ?? "").trim();
  }
  return "";
}

export function parseAccountCsv(text: string): ParsedAccountRow[] {
  const parsed = Papa.parse<Record<string, unknown>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  return (parsed.data ?? []).map((raw, i) => {
    const customerId = digits(
      pick(raw, ["customerid", "customer", "accountid", "id", "cid"])
    );
    const displayName = pick(raw, ["displayname", "name", "accountname"]);
    const website = pick(raw, ["website", "websiteslug", "slug"]) || null;
    const owningEmail =
      pick(raw, ["owninggmail", "owningemail", "gmail", "email"]) || null;
    const error =
      !customerId || customerId.length < 8
        ? "missing or invalid customer_id"
        : undefined;
    return {
      line: i + 2, // +1 header, +1 to 1-index
      customerId,
      displayName: displayName || customerId,
      website,
      owningEmail,
      error,
    };
  });
}
