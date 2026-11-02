import { describe, expect, it } from "vitest";
import { REQUIRED_METRICS } from "./completeness";
import { AUTO_COLUMNS, MANUAL_COLUMNS } from "./screenshot-extract-core";
import {
  AUTO_FIELDS,
  FIELD_LABEL,
  REQUIRED_FIELDS,
  STUDIO_FIELDS,
  filledCount,
  missingRequired,
} from "./input-fields";

describe("input form field groups", () => {
  const all = [...REQUIRED_FIELDS, ...STUDIO_FIELDS, ...AUTO_FIELDS];

  it("the Required section is exactly what reminders chase", () => {
    expect([...REQUIRED_FIELDS].sort()).toEqual([...REQUIRED_METRICS].sort());
  });

  it("every column the routes accept appears once, and nothing else", () => {
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...AUTO_COLUMNS, ...MANUAL_COLUMNS].sort());
  });

  it("every field has a label", () => {
    for (const c of all) expect(FIELD_LABEL[c], c).toBeTruthy();
    expect(FIELD_LABEL.totalLeads).toBe("Total PM");
    expect(FIELD_LABEL.filteredLeads).toBe("Document Collect");
  });

  it("counts filled boxes and missing required numbers", () => {
    expect(filledCount(REQUIRED_FIELDS, { totalLeads: "3", filteredLeads: " ", directMessages: "0" })).toBe(2);
    expect(missingRequired({ totalLeads: 3, filteredLeads: null, directMessages: 0 })).toBe(2);
  });
});
