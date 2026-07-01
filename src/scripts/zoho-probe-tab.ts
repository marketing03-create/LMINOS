/** Probe a specific worksheet's columns + sample rows. Usage: tsx zoho-probe-tab.ts <tabName> */
import { getZohoAccessToken } from "@/lib/zoho/auth";
const base = process.env.ZOHO_SHEET_DOMAIN ?? "https://sheet.zoho.com";
async function main() {
  const tab = process.argv[2] ?? "agent";
  const token = await getZohoAccessToken();
  const url = `${base}/api/v2/${encodeURIComponent(process.env.ZOHO_RESOURCE_ID!)}?method=worksheet.records.fetch`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${token}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ worksheet_name: tab, count: "5" }),
  });
  const json = await res.json() as { status?: string; records?: Record<string, unknown>[]; error_message?: string };
  if (json.status !== "success") { console.log("ERROR:", json.error_message); process.exit(1); }
  const recs = json.records ?? [];
  console.log(`Tab "${tab}" — ${recs.length} sample rows`);
  if (recs[0]) console.log("COLUMNS:", Object.keys(recs[0]).filter(k => k !== "row_index").join(" | "));
  console.log("");
  recs.forEach((r, i) => {
    const { row_index, ...rest } = r;
    console.log(`row ${row_index}:`, JSON.stringify(rest));
  });
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
