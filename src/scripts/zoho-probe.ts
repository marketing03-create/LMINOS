/**
 * Discover the worksheet name in a Zoho workbook + confirm auth works.
 * Usage: npm run zoho:probe
 */
import { getZohoAccessToken } from "@/lib/zoho/auth";

function sheetBase(): string {
  return process.env.ZOHO_SHEET_DOMAIN ?? "https://sheet.zoho.com";
}

async function call(method: string, body: Record<string, string>) {
  const token = await getZohoAccessToken();
  const resourceId = process.env.ZOHO_RESOURCE_ID!;
  const url = `${sheetBase()}/api/v2/${encodeURIComponent(
    resourceId
  )}?method=${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = await res.text();
  }
  return { status: res.status, json };
}

async function main() {
  await getZohoAccessToken();
  console.log("✓ auth OK\n");

  // 1. Try several method names that might list worksheets.
  const listMethods = [
    "workbook.sheets.list",
    "workbook.worksheets.list",
    "worksheets.list",
    "worksheet.list",
    "workbook.meta.fetch",
    "workbook.copy", // wrong, but error text sometimes reveals valid methods
  ];
  for (const m of listMethods) {
    const r = await call(m, {});
    const s = JSON.stringify(r.json);
    if (!s.includes("not supported")) {
      console.log(`METHOD ${m} →`, s.slice(0, 800));
    }
  }

  // 2. Brute-force common first-tab names.
  const candidates = [
    "Sheet 1",
    "Sheet1",
    "Form Responses 1",
    "Form Responses",
    "Data",
    "Leads",
    "Sales",
    "Submissions",
    "Form",
    "Response",
    "Responses",
    "Form1",
    "Worksheet",
    "Worksheet1",
  ];
  console.log("\nProbing candidate tab names…");
  for (const name of candidates) {
    const r = await call("worksheet.records.fetch", {
      worksheet_name: name,
      count: "1",
    });
    const ok =
      typeof r.json === "object" &&
      r.json !== null &&
      (r.json as { status?: string }).status === "success";
    console.log(`  ${ok ? "✓ FOUND" : "·"}  "${name}"${ok ? "  <-- USE THIS" : ""}`);
    if (ok) {
      const recs = (r.json as { records?: unknown[] }).records ?? [];
      console.log("    sample headers:", Object.keys((recs[0] as object) ?? {}).join(", "));
      break;
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("probe failed:", err.message);
  process.exit(1);
});
