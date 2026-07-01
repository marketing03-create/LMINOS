import Papa from "papaparse";
import { inboundLeadSchema, type InboundLead } from "../schema";

/**
 * Required headers (case-insensitive, snake_case):
 *   brand_slug, loan_type, phone
 *
 * Optional:
 *   full_name, email, source_channel, landing_page_url, keyword, location,
 *   campaign_name, ad_name, priority_level, notes
 */
const ALIASES: Record<string, keyof InboundLead> = {
  brand_slug: "brand_slug",
  brand: "brand_slug",
  loan_type: "loan_type",
  loan: "loan_type",
  product: "loan_type",
  full_name: "full_name",
  fullname: "full_name",
  name: "full_name",
  phone: "phone",
  phone_number: "phone",
  email: "email",
  email_address: "email",
  source_channel: "source_channel",
  channel: "source_channel",
  landing_page_url: "landing_page_url",
  url: "landing_page_url",
  keyword: "keyword",
  location: "location",
  city: "location",
  state: "location",
  campaign_name: "campaign_name",
  ad_name: "ad_name",
  priority_level: "priority_level",
  priority: "priority_level",
  notes: "notes",
  remarks: "notes",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

export type CsvRowResult =
  | { ok: true; row: number; lead: InboundLead }
  | { ok: false; row: number; error: string; raw: Record<string, unknown> };

export function parseLeadsCsv(text: string): {
  results: CsvRowResult[];
  okCount: number;
  errorCount: number;
} {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
    dynamicTyping: false,
  });

  const results: CsvRowResult[] = [];
  parsed.data.forEach((rawRow, idx) => {
    const rowNum = idx + 2; // header is row 1
    const mapped: Partial<Record<keyof InboundLead, unknown>> = {};
    for (const [key, value] of Object.entries(rawRow)) {
      const target = ALIASES[key];
      if (!target) continue;
      if (value == null || value === "") continue;
      mapped[target] = value;
    }

    const validation = inboundLeadSchema.safeParse(mapped);
    if (validation.success) {
      results.push({ ok: true, row: rowNum, lead: validation.data });
    } else {
      const msg = validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      results.push({ ok: false, row: rowNum, error: msg, raw: rawRow });
    }
  });

  const okCount = results.filter((r) => r.ok).length;
  return { results, okCount, errorCount: results.length - okCount };
}
