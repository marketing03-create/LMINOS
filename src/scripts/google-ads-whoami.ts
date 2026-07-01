/**
 * Diagnostic: list the customer accounts the authenticated user (refresh
 * token) can actually reach, and probe access to the target account.
 *   npx tsx --env-file=.env.local src/scripts/google-ads-whoami.ts
 */
import { getGoogleAdsAccessToken } from "@/lib/google-ads/auth";

const API = "v23";

async function main() {
  const token = await getGoogleAdsAccessToken();
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";

  const res = await fetch(
    `https://googleads.googleapis.com/${API}/customers:listAccessibleCustomers`,
    { headers: { Authorization: `Bearer ${token}`, "developer-token": devToken } }
  );
  const text = await res.text();
  console.log("listAccessibleCustomers → HTTP", res.status);
  try {
    const json = JSON.parse(text);
    const ids: string[] = (json.resourceNames ?? []).map((r: string) =>
      r.replace("customers/", "")
    );
    console.log("Accounts this login can reach directly:", ids.length ? ids : "(none)");
  } catch {
    console.log(text.slice(0, 400));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("whoami failed:", err.message);
  process.exit(1);
});
