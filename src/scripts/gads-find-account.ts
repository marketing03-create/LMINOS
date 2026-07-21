/**
 * Find a customer id in the accessible hierarchy + report which MCC can reach it.
 * Usage: npm run gads:find -- <customerId>
 */
import { getGoogleAdsAccessToken } from "@/lib/google-ads/auth";
import { normalizeCustomerId } from "@/lib/google-ads/client";

const API_VERSION = "v23";

async function listAccessible(accessToken: string, devToken: string): Promise<string[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,
    { headers: { Authorization: `Bearer ${accessToken}`, "developer-token": devToken } }
  );
  const j = await res.json();
  if (!res.ok) throw new Error(`listAccessible HTTP ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return (j.resourceNames ?? []).map((r: string) => r.split("/")[1]);
}

async function query(cid: string, loginCid: string, accessToken: string, devToken: string, q: string): Promise<any[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": devToken,
        "login-customer-id": normalizeCustomerId(loginCid),
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: q.trim() }),
    }
  );
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error(`non-JSON HTTP ${res.status}`); }
  if (!res.ok) {
    const e = Array.isArray(parsed) ? parsed[0] : parsed;
    throw new Error(`HTTP ${res.status}: ${e?.error?.message ?? "?"}`);
  }
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  const rows: any[] = [];
  for (const b of batches) for (const r of b.results ?? []) rows.push(r);
  return rows;
}

async function main() {
  const target = normalizeCustomerId(process.argv[2] ?? "");
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
  const accessToken = await getGoogleAdsAccessToken();

  const accessible = await listAccessible(accessToken, devToken);
  console.log(`\nAccessible top-level customers (${accessible.length}):`, accessible.join(", "), "\n");

  for (const mcc of accessible) {
    try {
      // Enumerate every client under this account (works if mcc is a manager).
      const clients = await query(mcc, mcc, accessToken, devToken, `
        SELECT customer_client.id, customer_client.descriptive_name,
               customer_client.manager, customer_client.status, customer_client.level
        FROM customer_client`);
      const hit = clients.find((r) => String(r.customerClient?.id) === target);
      console.log(`Under MCC ${mcc}: ${clients.length} client(s)${hit ? "  ← ⭐ CONTAINS TARGET" : ""}`);
      if (hit) {
        const c = hit.customerClient;
        console.log(`   ⭐ ${c.descriptiveName} (${c.id})  status=${c.status} manager=${c.manager} level=${c.level}`);
        console.log(`   → use login-customer-id=${mcc} to query it.\n`);
      }
      // Also list a few names to eyeball "Pinjam Pilot"
      for (const r of clients.slice(0, 40)) {
        const c = r.customerClient;
        if (String(c?.descriptiveName ?? "").toLowerCase().includes("pinjam") || String(c?.id) === target) {
          console.log(`     • ${c.descriptiveName} (${c.id}) status=${c.status}`);
        }
      }
    } catch (e: any) {
      console.log(`Under ${mcc}: cannot enumerate (${e.message})`);
    }
  }
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
