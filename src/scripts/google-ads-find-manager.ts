/**
 * Diagnostic: find which accessible manager account contains the target
 * customer, so we can set the correct login-customer-id.
 *   npx tsx --env-file=.env.local src/scripts/google-ads-find-manager.ts [TARGET_ID]
 */
import { getGoogleAdsAccessToken } from "@/lib/google-ads/auth";

const API = "v23";
const TARGET = (process.argv[2] ?? "5998534374").replace(/\D/g, "");

async function main() {
  const token = await getGoogleAdsAccessToken();
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";
  const H = (login?: string): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    "developer-token": devToken,
    "content-type": "application/json",
    ...(login ? { "login-customer-id": login } : {}),
  });

  const accRes = await fetch(
    `https://googleads.googleapis.com/${API}/customers:listAccessibleCustomers`,
    { headers: H() }
  );
  const accessible: string[] = ((await accRes.json()).resourceNames ?? []).map(
    (r: string) => r.replace("customers/", "")
  );
  console.log(`Login can reach ${accessible.length} top-level accounts. Scanning for ${TARGET}…\n`);

  const query =
    "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.level FROM customer_client";

  const hits: string[] = [];
  for (const mgr of accessible) {
    try {
      const res = await fetch(
        `https://googleads.googleapis.com/${API}/customers/${mgr}/googleAds:search`,
        { method: "POST", headers: H(mgr), body: JSON.stringify({ query }) }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const children: string[] = (json.results ?? []).map((r: {
        customerClient?: { id?: string };
      }) => String(r.customerClient?.id ?? ""));
      if (children.includes(TARGET)) {
        hits.push(mgr);
        const self = (json.results ?? []).find(
          (r: { customerClient?: { id?: string; descriptiveName?: string } }) =>
            String(r.customerClient?.id) === TARGET
        );
        const name = self?.customerClient?.descriptiveName ?? "(no name)";
        console.log(`✅ Manager ${mgr} contains ${TARGET}  →  "${name}"  (${children.length} accounts under it)`);
      }
    } catch {
      /* skip non-managers / errors */
    }
  }

  if (hits.length === 0) {
    console.log(`❌ None of the accessible managers contain ${TARGET}. This login has no path to that account.`);
  } else {
    console.log(`\n➡️  Use login-customer-id = ${hits[0]}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("find-manager failed:", err.message);
  process.exit(1);
});
