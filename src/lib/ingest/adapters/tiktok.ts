import { z } from "zod";
import { inboundLeadSchema, type InboundLead } from "../schema";

/**
 * TikTok Lead Generation webhook payload.
 * Reference: https://business-api.tiktok.com/portal/docs?id=1739585697680898
 *
 * Example body:
 * {
 *   "event": "form_submission",
 *   "form_id": "1234567890",
 *   "lead_id": "abc-123",
 *   "advertiser_id": "9999",
 *   "campaign_id": "111",
 *   "adgroup_id": "222",
 *   "ad_id": "333",
 *   "creative_id": "444",
 *   "submit_time": "2026-05-26T10:00:00Z",
 *   "fields": {
 *     "full_name": "Ahmad",
 *     "phone_number": "+60123456789",
 *     "email": "a@b.com",
 *     "loan_type": "personal",
 *     "brand_slug": "default"
 *   }
 * }
 */
export const tiktokPayloadSchema = z.object({
  event: z.string().optional(),
  form_id: z.string().optional(),
  lead_id: z.string(),
  advertiser_id: z.string().optional(),
  campaign_id: z.string().optional(),
  adgroup_id: z.string().optional(),
  ad_id: z.string().optional(),
  creative_id: z.string().optional(),
  submit_time: z.string().optional(),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});

export type TiktokPayload = z.infer<typeof tiktokPayloadSchema>;

const FIELD_KEYS = {
  brand_slug: ["brand_slug", "brand"],
  loan_type: ["loan_type", "product", "loan"],
  full_name: ["full_name", "fullname", "name"],
  phone: ["phone", "phone_number", "phonenumber", "telephone"],
  email: ["email", "email_address"],
  location: ["location", "city", "state", "region"],
  notes: ["notes", "comments", "message"],
};

function pick(
  fields: Record<string, string | number | null>,
  keys: string[]
): string | undefined {
  for (const key of Object.keys(fields)) {
    // Normalize: lowercase, trim, collapse internal whitespace to underscores.
    // Matches both "Loan Type" and "loan_type" against ["loan_type", ...].
    const k = key.toLowerCase().trim().replace(/\s+/g, "_");
    if (keys.includes(k)) {
      const v = fields[key];
      if (v == null) return undefined;
      return String(v);
    }
  }
  return undefined;
}

export function adaptTiktok(raw: unknown): InboundLead {
  const payload = tiktokPayloadSchema.parse(raw);
  const f = payload.fields;

  const canonical = {
    brand_slug: pick(f, FIELD_KEYS.brand_slug),
    loan_type: pick(f, FIELD_KEYS.loan_type),
    full_name: pick(f, FIELD_KEYS.full_name),
    phone: pick(f, FIELD_KEYS.phone),
    email: pick(f, FIELD_KEYS.email),
    source_channel: "tiktok_lead_form",
    landing_page_url: undefined,
    keyword: undefined,
    location: pick(f, FIELD_KEYS.location),
    ad_account_external_id: payload.advertiser_id,
    campaign_external_id: payload.campaign_id,
    campaign_name: undefined,
    ad_set_external_id: payload.adgroup_id,
    ad_external_id: payload.ad_id,
    creative_id: payload.creative_id,
    submitted_at: payload.submit_time,
    priority_level: undefined as InboundLead["priority_level"],
    notes: pick(f, FIELD_KEYS.notes),
  };

  return inboundLeadSchema.parse(canonical);
}
