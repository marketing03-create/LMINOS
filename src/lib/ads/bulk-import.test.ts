import { describe, expect, it } from "vitest";
import { parseAccountCsv } from "./parse-account-csv";

describe("parseAccountCsv", () => {
  it("parses rows with flexible headers + normalizes the customer id", () => {
    const csv = [
      "customer_id,display_name,website,owning_gmail",
      "123-456-7890,Dana Credit,dana_credit,a@gmail.com",
      "4567890123,Apply KL,apply_kl,b@gmail.com",
    ].join("\n");
    const rows = parseAccountCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      customerId: "1234567890", // dashes stripped
      displayName: "Dana Credit",
      website: "dana_credit",
      owningEmail: "a@gmail.com",
      error: undefined,
    });
    expect(rows[1].customerId).toBe("4567890123");
  });

  it("accepts alternative header names + defaults name to the id", () => {
    const csv = "Customer ID,Email\n999-888-7777,owner@x.com";
    const [row] = parseAccountCsv(csv);
    expect(row.customerId).toBe("9998887777");
    expect(row.displayName).toBe("9998887777"); // falls back to id
    expect(row.owningEmail).toBe("owner@x.com");
  });

  it("flags rows with a missing/invalid customer id", () => {
    const csv = "customer_id,name\n,No ID Co\nabc,Bad ID";
    const rows = parseAccountCsv(csv);
    expect(rows[0].error).toBeTruthy();
    expect(rows[1].error).toBeTruthy();
  });
});
