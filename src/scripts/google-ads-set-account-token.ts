/**
 * Attach a per-account Google Ads OAuth refresh token to an ad account, so the
 * sync can read accounts that live under a DIFFERENT Google login than the
 * global GOOGLE_ADS_REFRESH_TOKEN.
 *
 * Flow:
 *   1. npm run seed:ad-account -- google <externalId> <website> default "<Name>"
 *   2. npm run gads:exchange -- url <GOOGLE_ADS_CLIENT_ID>   (sign in as THAT Gmail, copy code)
 *   3. npm run gads:set-token -- <externalAccountId> <authCode> [redirectUri]
 *
 * Exchanges the code → refresh token, encrypts it (AES-256-GCM via ENCRYPTION_KEY),
 * and stores it on ad_accounts.access_token_encrypted. The token is never printed.
 * Requires GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / ENCRYPTION_KEY.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { encryptToken } from "@/lib/crypto/envelope";
import { exchangeAuthCodeForRefreshToken } from "@/lib/google-ads/auth";

async function main() {
  const [externalIdRaw, code, redirectUri] = process.argv.slice(2);
  if (!externalIdRaw || !code) {
    console.error(
      "usage: gads:set-token -- <externalAccountId> <authCode> [redirectUri]"
    );
    process.exit(1);
  }
  const externalAccountId = externalIdRaw.replace(/[^0-9]/g, "");

  const acct = await db.query.adAccounts.findFirst({
    where: and(
      eq(adAccounts.platform, "google"),
      eq(adAccounts.externalAccountId, externalAccountId)
    ),
    columns: { id: true, displayName: true },
  });
  if (!acct) {
    console.error(
      `No google ad account with external id ${externalAccountId}. Run seed:ad-account first.`
    );
    process.exit(1);
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET must be set");
    process.exit(1);
  }

  const { refreshToken } = await exchangeAuthCodeForRefreshToken({
    code,
    clientId,
    clientSecret,
    redirectUri,
  });

  const encrypted = encryptToken(refreshToken);
  await db
    .update(adAccounts)
    .set({ accessTokenEncrypted: encrypted })
    .where(eq(adAccounts.id, acct.id));

  console.log(
    `✓ Stored encrypted token for "${acct.displayName}" (${externalAccountId}). Run npm run gads:sync to pull its metrics.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ set-token failed:", err.message);
  console.error(
    "Common causes: code expired (re-run gads:exchange), wrong client id/secret, or ENCRYPTION_KEY not set."
  );
  process.exit(1);
});
