import { describe, expect, it } from "vitest";
import { adaptGoogle } from "./google";

describe("adaptGoogle", () => {
  it("maps user_column_data fields to canonical lead", () => {
    const lead = adaptGoogle({
      lead_id: "GLEAD-1",
      api_version: "1.0",
      form_id: "form-1",
      campaign_id: "camp-1",
      adgroup_id: "adgroup-1",
      creative_id: "cre-1",
      google_key: "secret",
      is_test: false,
      user_column_data: [
        {
          column_id: "FULL_NAME",
          column_name: "Full Name",
          string_value: "Ahmad",
        },
        {
          column_id: "PHONE_NUMBER",
          column_name: "Phone",
          string_value: "+60123456789",
        },
        { column_id: "EMAIL", column_name: "Email", string_value: "a@b.com" },
        {
          column_id: "loan_type",
          column_name: "Loan Type",
          string_value: "personal",
        },
        {
          column_id: "brand_slug",
          column_name: "Brand",
          string_value: "default",
        },
      ],
    });

    expect(lead.brand_slug).toBe("default");
    expect(lead.loan_type).toBe("personal");
    expect(lead.full_name).toBe("Ahmad");
    expect(lead.phone).toBe("+60123456789");
    expect(lead.email).toBe("a@b.com");
    expect(lead.campaign_external_id).toBe("camp-1");
    expect(lead.ad_set_external_id).toBe("adgroup-1");
    expect(lead.source_channel).toBe("google_ads_lead_form");
  });

  it("rejects payloads missing required fields", () => {
    expect(() =>
      adaptGoogle({
        lead_id: "GLEAD-2",
        user_column_data: [
          { column_name: "Full Name", string_value: "Test" },
        ],
      })
    ).toThrow();
  });
});
