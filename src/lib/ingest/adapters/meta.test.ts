import { describe, expect, it } from "vitest";
import { adaptMeta, metaWebhookEventSchema } from "./meta";

describe("metaWebhookEventSchema", () => {
  it("parses a real-shape leadgen webhook event", () => {
    const event = metaWebhookEventSchema.parse({
      object: "page",
      entry: [
        {
          id: "page-123",
          time: 1700000000,
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: "LG-1",
                page_id: "page-123",
                form_id: "F1",
                ad_id: "AD1",
                adgroup_id: "AS1",
                created_time: 1700000000,
              },
            },
          ],
        },
      ],
    });

    expect(event.entry[0].changes[0].value.leadgen_id).toBe("LG-1");
  });

  it("rejects non-page objects", () => {
    expect(() =>
      metaWebhookEventSchema.parse({
        object: "user",
        entry: [],
      })
    ).toThrow();
  });
});

describe("adaptMeta", () => {
  it("maps Graph field_data to canonical InboundLead", () => {
    const lead = adaptMeta(
      {
        id: "LG-1",
        created_time: "2026-05-26T10:00:00+0800",
        ad_id: "AD1",
        ad_name: "May Promo",
        adset_id: "AS1",
        adset_name: "KL Mobile",
        campaign_id: "C1",
        campaign_name: "Personal Loan May",
        form_id: "F1",
        field_data: [
          { name: "full_name", values: ["Siti Binti Ahmad"] },
          { name: "phone_number", values: ["+60123456789"] },
          { name: "email", values: ["siti@example.com"] },
          { name: "loan_type", values: ["personal"] },
          { name: "brand_slug", values: ["default"] },
        ],
      },
      "page-123"
    );

    expect(lead.brand_slug).toBe("default");
    expect(lead.loan_type).toBe("personal");
    expect(lead.full_name).toBe("Siti Binti Ahmad");
    expect(lead.campaign_name).toBe("Personal Loan May");
    expect(lead.ad_name).toBe("May Promo");
    expect(lead.source_channel).toBe("meta_lead_ad");
  });

  it("falls back to default brand slug when not in fields", () => {
    const prev = process.env.META_DEFAULT_BRAND_SLUG;
    process.env.META_DEFAULT_BRAND_SLUG = "fallback-brand";
    try {
      const lead = adaptMeta(
        {
          id: "LG-2",
          created_time: "2026-05-26T10:00:00Z",
          form_id: "F2",
          field_data: [
            { name: "full_name", values: ["x"] },
            { name: "phone_number", values: ["+60123456789"] },
            { name: "loan_type", values: ["personal"] },
          ],
        },
        undefined
      );
      expect(lead.brand_slug).toBe("fallback-brand");
    } finally {
      process.env.META_DEFAULT_BRAND_SLUG = prev;
    }
  });
});
