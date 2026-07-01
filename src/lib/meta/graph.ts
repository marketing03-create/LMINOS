import { z } from "zod";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";

/**
 * Shape returned by `GET /{leadgen_id}` on the Meta Graph API.
 * https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
 */
export const metaLeadFetchSchema = z.object({
  id: z.string(),
  created_time: z.string(),
  ad_id: z.string().optional(),
  ad_name: z.string().optional(),
  adset_id: z.string().optional(),
  adset_name: z.string().optional(),
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  form_id: z.string().optional(),
  field_data: z.array(
    z.object({
      name: z.string(),
      values: z.array(z.string()),
    })
  ),
});

export type MetaLeadFetch = z.infer<typeof metaLeadFetchSchema>;

/**
 * Fetch the lead detail from Meta Graph using a page access token.
 * Throws on network / parse failure so BullMQ retries the job.
 */
export async function fetchMetaLead(
  leadgenId: string,
  pageAccessToken: string
): Promise<MetaLeadFetch> {
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}`
  );
  url.searchParams.set("access_token", pageAccessToken);
  url.searchParams.set(
    "fields",
    "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data"
  );

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Meta Graph fetch failed: HTTP ${res.status} — ${text.slice(0, 200)}`
    );
  }
  const json = await res.json();
  return metaLeadFetchSchema.parse(json);
}
