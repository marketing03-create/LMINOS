/**
 * Export the ad-account manifest for the Adrify migration as CSV (stdout).
 * Read-only. Usage:
 *   npx tsx --env-file=.env.local src/scripts/export-adrify-accounts.ts > accounts.csv
 * Columns: platform, customer_id, name, owning_gmail, website_slug, status,
 * is_active, has_own_token, last_synced. No secrets (tokens are never exported).
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

function rows<T = Record<string, unknown>>(res: unknown): T[] {
  return ((res as { rows?: unknown }).rows ?? res) as T[];
}
function csv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const data = rows(
    await db.execute(sql`
      select platform, external_account_id as customer_id, display_name as name,
             coalesce(owning_email, '') as owning_gmail,
             coalesce(website, '') as website_slug, status, is_active,
             (access_token_encrypted is not null) as has_own_token,
             to_char(last_synced_at, 'YYYY-MM-DD HH24:MI') as last_synced
      from ad_accounts order by platform, display_name`)
  );
  const cols = [
    "platform",
    "customer_id",
    "name",
    "owning_gmail",
    "website_slug",
    "status",
    "is_active",
    "has_own_token",
    "last_synced",
  ];
  console.log(cols.join(","));
  for (const r of data) console.log(cols.map((c) => csv((r as Record<string, unknown>)[c])).join(","));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
