import { z } from "zod";
import { inboundLeadSchema, type InboundLead } from "../schema";

/**
 * Google Ads Lead Form webhook payload.
 * Reference: https://developers.google.com/google-ads/lead-form-extensions/lead-data
 *
 * Example body:
 * {
 *   "lead_id": "TeSt-LeAd-1",
 *   "user_column_data": [
 *     {"column_name": "Full Name", "string_value": "Ahmad", "column_id": "FULL_NAME"},
 *     {"column_name": "Phone Number", "string_value": "+60123456789", "column_id": "PHONE_NUMBER"},
 *     {"column_name": "Email", "string_value": "a@b.com", "column_id": "EMAIL"},
 *     {"column_name": "loan_type", "string_value": "personal", "column_id": "loan_type"}
 *   ],
 *   "api_version": "1.0",
 *   "form_id": "12345",
 *   "campaign_id": "111",
 *   "google_key": "<shared secret>",
 *   "is_test": false,
 *   "gcl_id": "Cj0...",
 *   "adgroup_id": "222",
 *   "creative_id": "333",
 *   "google_lead_source": "GOOGLE_SEARCH"
 * }
 */
export const googleColumnSchema = z.object({
  column_name: z.string(),
  column_id: z.string().optional(),
  string_value: z.string().optional(),
});

export const googlePayloadSchema = z.object({
  lead_id: z.string(),
  user_column_data: z.array(googleColumnSchema),
  api_version: z.string().optional(),
  form_id: z.string().optional(),
  campaign_id: z.string().optional(),
  adgroup_id: z.string().optional(),
  creative_id: z.string().optional(),
  google_key: z.string().optional(),
  is_test: z.boolean().optional(),
  gcl_id: z.string().optional(),
  google_lead_source: z.string().optional(),
});

export type GooglePayload = z.infer<typeof googlePayloadSchema>;

const FIELD_MAP: Record<string, keyof InboundLead> = {
  full_name: "full_name",
  fullname: "full_name",
  name: "full_name",
  phone_number: "phone",
  phone: "phone",
  email: "email",
  email_address: "email",
  loan_type: "loan_type",
  brand: "brand_slug",
  brand_slug: "brand_slug",
  city: "location",
  state: "location",
  location: "location",
  notes: "notes",
};

function pickColumn(
  data: GooglePayload["user_column_data"],
  ...keys: string[]
): string | undefined {
  for (const c of data) {
    const k = (c.column_id ?? c.column_name).toLowerCase().replace(/\s+/g, "_");
    if (keys.includes(k)) return c.string_value;
  }
  return undefined;
}

/**
 * Map a Google Ads payload to canonical InboundLead.
 * The form MUST include either `brand_slug` or a known `brand` column.
 * Validates the final shape with Zod (throws on missing required fields).
 */
export function adaptGoogle(raw: unknown): InboundLead {
  const payload = googlePayloadSchema.parse(raw);

  // Walk user_column_data and bucket each into canonical fields.
  const bag: Record<string, string | undefined> = {};
  for (const c of payload.user_column_data) {
    const rawKey = (c.column_id ?? c.column_name)
      .toLowerCase()
      .replace(/\s+/g, "_");
    const target = FIELD_MAP[rawKey];
    if (target) bag[target] = c.string_value;
  }

  const canonical = {
    brand_slug: bag.brand_slug,
    loan_type: bag.loan_type,
    full_name: bag.full_name,
    phone: bag.phone ?? pickColumn(payload.user_column_data, "phone_number"),
    email: bag.email,
    source_channel: "google_ads_lead_form",
    landing_page_url: undefined,
    keyword: undefined,
    location: bag.location,
    ad_account_external_id: undefined,
    campaign_external_id: payload.campaign_id,
    campaign_name: undefined,
    ad_set_external_id: payload.adgroup_id,
    ad_external_id: payload.creative_id,
    creative_id: payload.creative_id,
    priority_level: undefined as InboundLead["priority_level"],
    notes: bag.notes,
  };

  return inboundLeadSchema.parse(canonical);
}
