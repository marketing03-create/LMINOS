/**
 * One-time: exchange a Zoho Self Client authorization code for a refresh token.
 *
 * Usage:
 *   npx tsx src/scripts/zoho-exchange-code.ts <CLIENT_ID> <CLIENT_SECRET> <CODE> [ACCOUNTS_DOMAIN]
 *
 * ACCOUNTS_DOMAIN defaults to https://accounts.zoho.com. Use the regional
 * variant if the Zoho account lives elsewhere (e.g. https://accounts.zoho.com.au).
 *
 * Prints the refresh token — copy it into ZOHO_REFRESH_TOKEN.
 */
import { exchangeAuthCodeForRefreshToken } from "@/lib/zoho/auth";

async function main() {
  const [clientId, clientSecret, code, accountsDomain] = process.argv.slice(2);
  if (!clientId || !clientSecret || !code) {
    console.error(
      "usage: zoho-exchange-code <CLIENT_ID> <CLIENT_SECRET> <CODE> [ACCOUNTS_DOMAIN]"
    );
    process.exit(1);
  }
  const out = await exchangeAuthCodeForRefreshToken({
    clientId,
    clientSecret,
    code,
    accountsDomain,
  });
  console.log("\n✓ Exchange succeeded.\n");
  console.log("ZOHO_REFRESH_TOKEN=" + out.refreshToken);
  if (out.apiDomain) console.log("(api_domain reported: " + out.apiDomain + ")");
  console.log(
    "\nAdd ZOHO_REFRESH_TOKEN (+ client id/secret) to .env.local and Vercel.\n"
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Exchange failed:", err.message);
  console.error(
    "Common causes: code expired (10 min limit), wrong client id/secret, or wrong data-center domain."
  );
  process.exit(1);
});
