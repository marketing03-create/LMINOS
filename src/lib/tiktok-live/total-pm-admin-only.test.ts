import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_TIKTOK_FIELDS,
  METRIC_LABEL,
  missingMetrics,
  missingStreamerLeadMetrics,
  missingStreamerMetrics,
  STREAMER_METRICS,
  streamerSentAdminOnly,
} from "./completeness";

// Total PM (totalLeads) is admin-only. These pin the rule so a later change
// can't quietly put it back in front of a streamer.
describe("Total PM is admin-only", () => {
  const onlyTotalMissing = {
    totalLeads: null,
    filteredLeads: 2,
    directMessages: 5,
    serviceBioViews: 9,
  };

  it("labels read Total PM and Document Collect", () => {
    expect(METRIC_LABEL.totalLeads).toBe("Total PM");
    expect(METRIC_LABEL.filteredLeads).toBe("Document Collect");
  });

  it("a streamer is never asked for Total PM", () => {
    expect(STREAMER_METRICS).not.toContain("totalLeads");
    expect(missingStreamerMetrics(onlyTotalMissing)).toEqual([]);
    expect(missingStreamerLeadMetrics(onlyTotalMissing)).toEqual([]);
  });

  it("admins still see it missing", () => {
    expect(missingMetrics(onlyTotalMissing)).toEqual(["totalLeads"]);
  });

  it("the streamer view still chases what they own", () => {
    expect(
      missingStreamerMetrics({ filteredLeads: null, directMessages: null, serviceBioViews: 1 })
    ).toEqual(["filteredLeads", "directMessages"]);
  });

  it("flags any streamer write that carries Total PM, even a null", () => {
    expect(ADMIN_ONLY_TIKTOK_FIELDS).toContain("totalLeads");
    expect(streamerSentAdminOnly({ totalLeads: 5 })).toBe(true);
    expect(streamerSentAdminOnly({ totalLeads: null })).toBe(true);
    expect(streamerSentAdminOnly({ filteredLeads: 3 })).toBe(false);
    expect(streamerSentAdminOnly(null)).toBe(false);
  });
});
