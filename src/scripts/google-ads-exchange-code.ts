/**
 * One-time helper to obtain a Google Ads refresh token.
 *
 * Step 1 — print the consent URL:
 *   npm run gads:exchange -- url <CLIENT_ID> [REDIRECT_URI]
 *   Open it, sign in with the Google account that can see the Ads data,
 *   approve. You'll be redirected to <REDIRECT_URI>/?code=...  (the page may
 *   fail to load — that's fine, copy the `code` value from the address bar).
 *
 * Step 2 — exchange the code for a refresh token:
 *   npm run gads:exchange -- code <CLIENT_ID> <CLIENT_SECRET> <CODE> [REDIRECT_URI]
 *
 * REDIRECT_URI defaults to http://localhost (register it on the OAuth client).
 * Copy the printed GOOGLE_ADS_REFRESH_TOKEN into .env.local and Vercel.
 */
import {
  consentUrl,
  exchangeAuthCodeForRefreshToken,
  DEFAULT_REDIRECT_URI,
} from "@/lib/google-ads/auth";

async function main() {
  const [mode, ...rest] = process.argv.slice(2);

  if (mode === "url") {
    const [clientId, redirectUri] = rest;
    if (!clientId) {
      console.error("usage: gads:exchange -- url <CLIENT_ID> [REDIRECT_URI]");
      process.exit(1);
    }
    console.log("\nOpen this URL, approve, then copy the `code` param:\n");
    console.log(consentUrl({ clientId, redirectUri }));
    console.log(
      `\n(redirect: ${redirectUri ?? DEFAULT_REDIRECT_URI} — must be registered on the OAuth client)\n`
    );
    process.exit(0);
  }

  if (mode === "code") {
    const [clientId, clientSecret, code, redirectUri] = rest;
    if (!clientId || !clientSecret || !code) {
      console.error(
        "usage: gads:exchange -- code <CLIENT_ID> <CLIENT_SECRET> <CODE> [REDIRECT_URI]"
      );
      process.exit(1);
    }
    const out = await exchangeAuthCodeForRefreshToken({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });
    console.log("\n✓ Exchange succeeded.\n");
    console.log("GOOGLE_ADS_REFRESH_TOKEN=" + out.refreshToken);
    console.log("\nAdd it (+ client id/secret, developer token, login customer id) to .env.local and Vercel.\n");
    process.exit(0);
  }

  console.error(
    "usage:\n  gads:exchange -- url  <CLIENT_ID> [REDIRECT_URI]\n  gads:exchange -- code <CLIENT_ID> <CLIENT_SECRET> <CODE> [REDIRECT_URI]"
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("✗ Failed:", err.message);
  process.exit(1);
});
