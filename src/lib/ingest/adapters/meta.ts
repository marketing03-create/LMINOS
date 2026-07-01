import { z } from "zod";
import type { MetaLeadFetch } from "@/lib/meta/graph";
import { inboundLeadSchema, type InboundLead } from "../schema";

/**
 * Meta (Facebook + Instagram) Lead Ads webhook event.
 * The webhook does NOT contain field values — only an opaque `leadgen_id`
 * that the worker resolves via Graph API.
 *
 * https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
 */
export const metaWebhookEventSchema = z.object({
  object: z.literal("page"),
  entry: z.array(
    z.object({
      id: z.string(),
      time: z.number().optional(),
      changes: z.array(
        z.object({
          field: z.literal("leadgen"),
          value: z.object({
            leadgen_id: z.string(),
            page_id: z.string().optional(),
            form_id: z.string().optional(),
            ad_id: z.string().optional(),
            adgroup_id: z.string().optional(),
            created_time: z.number().optional(),
          }),
        })
      ),
    })
  ),
});

export type MetaWebhookEvent = z.infer<typeof metaWebhookEventSchema>;

/**
 * Brand resolution for Meta is keyed on the page_id. Configure a mapping
 * in env (`META_PAGE_BRAND_MAP`) as JSON: { "<page_id>": "<brand_slug>" }.
 * Falls back to META_DEFAULT_BRAND_SLUG.
 */
function brandSlugForPage(pageId: string | undefined): string {
  if (pageId) {
    try {
      const map = JSON.parse(process.env.META_PAGE_BRAND_MAP ?? "{}") as Record<
        string,
        string
      >;
      if (map[pageId]) return map[pageId];
    } catch {
      // Fall through to default.
    }
  }
  return process.env.META_DEFAULT_BRAND_SLUG ?? "default";
}

const FIELD_KEYS = {
  full_name: ["full_name", "first_name", "name"],
  phone: ["phone_number", "phone"],
  email: ["email"],
  loan_type: ["loan_type", "loan"],
  brand_slug: ["brand_slug", "brand"],
  location: ["city", "state", "location"],
  notes: ["custom_notes", "notes", "message"],
};

function toStrictIso(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function pickField(
  fields: MetaLeadFetch["field_data"],
  keys: string[]
): string | undefined {
  for (const f of fields) {
    if (keys.includes(f.name.toLowerCase().trim())) {
      return f.values[0];
    }
  }
  return undefined;
}

/**
 * Adapt a Graph-fetched Meta lead to canonical InboundLead.
 * `pageId` comes from the webhook event (not the Graph response).
 */
export function adaptMeta(
  fetched: MetaLeadFetch,
  pageId: string | undefined
): InboundLead {
  const fd = fetched.field_data;
  const canonical = {
    brand_slug: pickField(fd, FIELD_KEYS.brand_slug) ?? brandSlugForPage(pageId),
    loan_type: pickField(fd, FIELD_KEYS.loan_type) ?? "personal",
    full_name: pickField(fd, FIELD_KEYS.full_name),
    phone: pickField(fd, FIELD_KEYS.phone),
    email: pickField(fd, FIELD_KEYS.email),
    source_channel: "meta_lead_ad",
    landing_page_url: undefined,
    keyword: undefined,
    location: pickField(fd, FIELD_KEYS.location),
    ad_account_external_id: undefined,
    campaign_external_id: fetched.campaign_id,
    campaign_name: fetched.campaign_name,
    ad_set_external_id: fetched.adset_id,
    ad_set_name: fetched.adset_name,
    ad_external_id: fetched.ad_id,
    ad_name: fetched.ad_name,
    creative_id: undefined,
    // Meta returns "2026-05-26T10:00:00+0800" (ISO basic). Re-emit as
    // strict UTC "Z" form so Zod's datetime validator accepts it.
    submitted_at: toStrictIso(fetched.created_time),
    priority_level: undefined as InboundLead["priority_level"],
    notes: pickField(fd, FIELD_KEYS.notes),
  };

  return inboundLeadSchema.parse(canonical);
}
