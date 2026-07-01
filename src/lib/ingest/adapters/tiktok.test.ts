import { describe, expect, it } from "vitest";
import { adaptTiktok } from "./tiktok";

describe("adaptTiktok", () => {
  it("maps a form_submission event to canonical", () => {
    const lead = adaptTiktok({
      event: "form_submission",
      form_id: "f1",
      lead_id: "TLEAD-1",
      advertiser_id: "adv-1",
      campaign_id: "camp-1",
      adgroup_id: "ag-1",
      ad_id: "ad-1",
      creative_id: "cre-1",
      submit_time: "2026-05-26T10:00:00.000Z",
      fields: {
        brand_slug: "default",
        loan_type: "sme",
        full_name: "Lim Wei Chen",
        phone_number: "012 345 6789",
        email: "lim@example.com",
        city: "Petaling Jaya",
      },
    });

    expect(lead.brand_slug).toBe("default");
    expect(lead.loan_type).toBe("sme");
    expect(lead.phone).toBe("012 345 6789");
    expect(lead.location).toBe("Petaling Jaya");
    expect(lead.ad_account_external_id).toBe("adv-1");
    expect(lead.ad_external_id).toBe("ad-1");
    expect(lead.submitted_at).toBe("2026-05-26T10:00:00.000Z");
  });

  it("handles case-insensitive field keys", () => {
    const lead = adaptTiktok({
      lead_id: "T2",
      fields: {
        Brand: "default",
        "Loan Type": "personal",
        Phone: "+60123456789",
      } as Record<string, string>,
    });
    expect(lead.brand_slug).toBe("default");
    expect(lead.loan_type).toBe("personal");
    expect(lead.phone).toBe("+60123456789");
  });
});
