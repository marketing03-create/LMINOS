import { describe, expect, it } from "vitest";
// The same column lists the write routes use (queries.ts mirrors them), from
// the db-free module.
import { AUTO_COLUMNS as AUTO_TIKTOK_FIELDS, MANUAL_COLUMNS as MANUAL_TIKTOK_FIELDS } from "./screenshot-extract-core";
import { CONNECTOR_FIELDS, connectorKeys, entrySource, sourceClass, SOURCE_TEXT } from "./entry-source";

describe("which numbers came from Fly.io and which from a person", () => {
  it("every captured column is a connector field; no typed-only column is", () => {
    for (const f of AUTO_TIKTOK_FIELDS) expect(CONNECTOR_FIELDS).toContain(f);
    for (const f of MANUAL_TIKTOK_FIELDS) expect(CONNECTOR_FIELDS).not.toContain(f);
  });

  it("a captured number is Fly.io's until a person enters it", () => {
    expect(entrySource("totalViews", 1200, [])).toBe("connector");
    expect(entrySource("totalViews", 1200, ["totalViews"])).toBe("person");
    expect(entrySource("durationSeconds", 3600, ["totalViews"])).toBe("connector");
  });

  it("typed-only numbers are always a person's, and blanks have no source", () => {
    expect(entrySource("totalLeads", 7, [])).toBe("person");
    expect(entrySource("filteredLeads", 0, [])).toBe("person");
    expect(entrySource("totalLeads", null, ["totalLeads"])).toBeNull();
  });

  it("colours: white for Fly.io, yellow for a person", () => {
    expect(sourceClass("totalLikes", 5, [])).toBe(SOURCE_TEXT.connector);
    expect(SOURCE_TEXT.connector).toContain("dark:text-white");
    expect(sourceClass("totalLeads", 5, [])).toBe(SOURCE_TEXT.person);
    expect(SOURCE_TEXT.person).toContain("yellow");
  });

  it("only connector fields are recorded from a write", () => {
    expect(connectorKeys(["totalViews", "totalLeads", "remarks", "keywordLeads"])).toEqual([
      "totalViews",
      "keywordLeads",
    ]);
  });
});
