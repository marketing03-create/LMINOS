/**
 * Option-A export for Adrify: each Google ad account + its ENCRYPTED OAuth
 * refresh token, so Adrify (using the SAME OAuth client + SAME ENCRYPTION_KEY as
 * LMIROS) can import them and drive the accounts with no re-consent.
 *
 * ⚠️ SENSITIVE: the `access_token_encrypted` values are credentials. Anyone with
 * this file AND the shared ENCRYPTION_KEY can control the ad accounts. Transfer
 * it securely and delete it after Adrify imports. It is NOT plaintext (AES-256-GCM).
 *
 * Read-only. Usage:
 *   npx tsx --env-file=.env.local src/scripts/export-adrify-tokens.ts > out.json
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

function rows<T = Record<string, unknown>>(res: unknown): T[] {
  return ((res as { rows?: unknown }).rows ?? res) as T[];
}

async function main() {
  const data = rows(
    await db.execute(sql`
      select platform,
             external_account_id  as customer_id,
             display_name         as name,
             owning_email         as owning_gmail,
             status,
             is_active,
             access_token_encrypted
      from ad_accounts
      where platform = 'google'
      order by display_name`)
  );
  console.log(
    JSON.stringify(
      {
        note: "LMIROS → Adrify (Option A). Import with the SAME OAuth client + ENCRYPTION_KEY. access_token_encrypted is AES-256-GCM ciphertext of the OAuth refresh token.",
        exportedCount: data.length,
        accounts: data,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
