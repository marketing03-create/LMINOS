import Papa from "papaparse";
import { z } from "zod";

/**
 * Spend CSV row contract.
 * Required: platform, ad_account_external_id, campaign_external_id, date, spend
 * Optional: ad_set_external_id, ad_external_id, campaign_name, ad_set_name,
 *           ad_name, impressions, clicks, platform_leads_reported
 */
export const spendRowSchema = z.object({
  platform: z.enum(["meta", "google", "tiktok"]),
  ad_account_external_id: z.string().min(1),
  campaign_external_id: z.string().min(1),
  campaign_name: z.string().optional(),
  ad_set_external_id: z.string().optional(),
  ad_set_name: z.string().optional(),
  ad_external_id: z.string().optional(),
  ad_name: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  spend: z.coerce.number().nonnegative(),
  impressions: z.coerce.number().int().nonnegative().optional(),
  clicks: z.coerce.number().int().nonnegative().optional(),
  platform_leads_reported: z.coerce.number().int().nonnegative().optional(),
  // Platform-reported conversions (may be fractional) + value.
  conversions: z.coerce.number().nonnegative().optional(),
  conversion_value: z.coerce.number().nonnegative().optional(),
});

export type SpendRow = z.infer<typeof spendRowSchema>;

const ALIASES: Record<string, keyof SpendRow> = {
  platform: "platform",
  ad_account: "ad_account_external_id",
  ad_account_id: "ad_account_external_id",
  ad_account_external_id: "ad_account_external_id",
  account_id: "ad_account_external_id",
  campaign: "campaign_external_id",
  campaign_id: "campaign_external_id",
  campaign_external_id: "campaign_external_id",
  campaign_name: "campaign_name",
  ad_set: "ad_set_external_id",
  ad_set_id: "ad_set_external_id",
  adset_id: "ad_set_external_id",
  ad_set_external_id: "ad_set_external_id",
  ad_set_name: "ad_set_name",
  adset_name: "ad_set_name",
  ad: "ad_external_id",
  ad_id: "ad_external_id",
  ad_external_id: "ad_external_id",
  ad_name: "ad_name",
  date: "date",
  day: "date",
  spend: "spend",
  cost: "spend",
  amount_spent: "spend",
  impressions: "impressions",
  impr: "impressions",
  clicks: "clicks",
  link_clicks: "clicks",
  leads: "platform_leads_reported",
  platform_leads: "platform_leads_reported",
  platform_leads_reported: "platform_leads_reported",
  conversions: "conversions",
  conv: "conversions",
  conversion_value: "conversion_value",
  conv_value: "conversion_value",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeDate(input: string): string {
  // Already ISO calendar date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  // Accept M/D/YYYY or D/M/YYYY (and the '-' variants). Heuristic: if the
  // first part is > 12, it must be the day. We parse arithmetically rather
  // than via new Date() because `new Date("5/20/2026")` parses to LOCAL
  // midnight, which shifts the calendar day to the previous UTC date on
  // Malaysia's UTC+8 machines.
  const m = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, a, b, year] = m;
    const month = Number(a) > 12 ? Number(b) : Number(a);
    const day = Number(a) > 12 ? Number(a) : Number(b);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // ISO datetime — strip the time portion (Z/offset can't shift the day).
  const iso = input.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (iso) return iso[1];

  return input; // let zod reject it
}

export type SpendRowResult =
  | { ok: true; row: number; data: SpendRow }
  | { ok: false; row: number; error: string; raw: Record<string, unknown> };

export function parseSpendCsv(text: string): {
  results: SpendRowResult[];
  okCount: number;
  errorCount: number;
} {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
    dynamicTyping: false,
  });

  const results: SpendRowResult[] = [];
  parsed.data.forEach((rawRow, idx) => {
    const rowNum = idx + 2;
    const mapped: Partial<Record<keyof SpendRow, unknown>> = {};
    for (const [key, value] of Object.entries(rawRow)) {
      const target = ALIASES[key];
      if (!target) continue;
      if (value == null || value === "") continue;
      mapped[target] = target === "date" ? normalizeDate(String(value)) : value;
    }
    const validation = spendRowSchema.safeParse(mapped);
    if (validation.success) {
      results.push({ ok: true, row: rowNum, data: validation.data });
    } else {
      results.push({
        ok: false,
        row: rowNum,
        error: validation.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        raw: rawRow,
      });
    }
  });

  return {
    results,
    okCount: results.filter((r) => r.ok).length,
    errorCount: results.filter((r) => !r.ok).length,
  };
}
