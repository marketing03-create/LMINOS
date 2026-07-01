import { z } from "zod";

/**
 * Canonical inbound lead schema (post-source-adaptation).
 *
 * Each source adapter (website, meta, google, tiktok) MUST shape its raw
 * payload into this shape before the ingest worker validates it.
 */
export const inboundLeadSchema = z.object({
  brand_slug: z.string().min(1),
  loan_type: z.string().min(1),

  full_name: z.string().optional(),
  phone: z.string().min(1),
  email: z.string().optional(),

  source_channel: z.string().optional(),
  landing_page_url: z.string().optional(),
  keyword: z.string().optional(),
  location: z.string().optional(),

  // Optional ad attribution. Adapters can leave these blank.
  ad_account_external_id: z.string().optional(),
  campaign_external_id: z.string().optional(),
  campaign_name: z.string().optional(),
  ad_set_external_id: z.string().optional(),
  ad_set_name: z.string().optional(),
  ad_external_id: z.string().optional(),
  ad_name: z.string().optional(),
  creative_id: z.string().optional(),

  priority_level: z.enum(["hot", "warm", "cold", "vip"]).optional(),
  // Accept ISO 8601 with or without timezone offset (Meta returns +0800).
  // Tolerated formats: "2026-05-26T10:00:00Z", "2026-05-26T10:00:00+0800",
  // "2026-05-26T10:00:00.000Z".
  submitted_at: z.string().datetime({ offset: true }).optional(),
  notes: z.string().optional(),
});

export type InboundLead = z.infer<typeof inboundLeadSchema>;
