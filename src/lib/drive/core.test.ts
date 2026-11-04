import { describe, expect, it } from "vitest";
import {
  cleanName,
  customerFolderName,
  isComplete,
  localPhone,
  mytDay,
  nextFilteredLeads,
  parseServiceAccountJson,
  parseSharedDriveId,
  tallyFiles,
  totalOf,
} from "./core";

describe("customer folder names", () => {
  it("writes the phone the Malaysian way", () => {
    expect(localPhone("60123456789")).toBe("0123456789");
    expect(localPhone("6591234567")).toBe("+6591234567");
    expect(customerFolderName("Ahmad bin Ali", "60123456789")).toBe("Ahmad bin Ali 0123456789");
  });

  it("tidies names and refuses blanks", () => {
    expect(cleanName("  Siti   Aminah ")).toBe("Siti Aminah");
    expect(cleanName(" ")).toBeNull();
    expect(cleanName(5)).toBeNull();
  });

  it("dates folders by the Malaysian day", () => {
    // 4 Nov 17:00 UTC is already 5 Nov 01:00 in Malaysia.
    expect(mytDay(new Date("2026-11-04T17:00:00Z"))).toBe("2026-11-05");
    expect(mytDay(new Date("2026-11-04T15:59:00Z"))).toBe("2026-11-04");
  });
});

describe("what an admin pastes", () => {
  it("takes a Shared Drive id or its link", () => {
    expect(parseSharedDriveId("0AB12cdEFgh34Uk9PVA")).toBe("0AB12cdEFgh34Uk9PVA");
    expect(parseSharedDriveId("https://drive.google.com/drive/u/1/folders/0AB12cdEFgh34Uk9PVA")).toBe(
      "0AB12cdEFgh34Uk9PVA"
    );
    expect(parseSharedDriveId("not a drive")).toBeNull();
  });

  it("accepts only a real service-account key", () => {
    const key = {
      type: "service_account",
      client_email: "tt-stars@proj.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    };
    expect(parseServiceAccountJson(JSON.stringify(key))).toEqual({
      clientEmail: key.client_email,
      privateKey: key.private_key,
    });
    expect(parseServiceAccountJson(JSON.stringify({ ...key, type: "authorized_user" }))).toBeNull();
    expect(parseServiceAccountJson(JSON.stringify({ ...key, client_email: "me@gmail.com" }))).toBeNull();
    expect(parseServiceAccountJson("{oops")).toBeNull();
  });
});

describe("counting a customer's documents", () => {
  const sub = { ic: "IC1", payslip: "PS1", bankStatement: "BS1" };

  it("counts files by subfolder, and loose ones as other", () => {
    const c = tallyFiles("ROOT", sub, [
      { parents: ["IC1"] },
      { parents: ["IC1"] },
      { parents: ["PS1"] },
      { parents: ["ROOT"] },
      { parents: ["SOMEWHERE_ELSE"] },
      {},
    ]);
    expect(c).toEqual({ ic: 2, payslip: 1, bankStatement: 0, other: 1 });
    expect(totalOf(c)).toBe(4);
    expect(isComplete(c)).toBe(false);
    expect(isComplete({ ...c, bankStatement: 1 })).toBe(true);
    expect(isComplete(null)).toBe(false);
  });
});

describe("Document Collect from Drive", () => {
  it("fills a blank, and follows its own last number", () => {
    expect(nextFilteredLeads(null, null, 3)).toBe(3);
    expect(nextFilteredLeads(3, 3, 5)).toBe(5);
    expect(nextFilteredLeads(3, 3, 2)).toBe(2);
  });

  it("leaves a blank blank while no folder has a file", () => {
    expect(nextFilteredLeads(null, null, 0)).toBeNull();
  });

  it("never overwrites a number a person typed", () => {
    expect(nextFilteredLeads(16, null, 3)).toBe(16);
    expect(nextFilteredLeads(16, 3, 5)).toBe(16);
  });
});
