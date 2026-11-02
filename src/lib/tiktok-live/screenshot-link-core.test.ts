import { describe, expect, it } from "vitest";
import { uploadsForSession, type RecentUpload } from "./screenshot-link-core";

const at = (iso: string) => new Date(iso);

// The real 2 Nov batch: 22/10, 29/10 and 31/10 screenshots uploaded within
// ~30 minutes, then applied to the 31/10 live.
const uploads: RecentUpload[] = [
  { id: "oct22-view", detectedDate: "2026-10-22", createdAt: at("2026-11-02T03:46:02Z") },
  { id: "oct29-congrats", detectedDate: null, createdAt: at("2026-11-02T03:50:53Z") },
  { id: "oct29-eng", detectedDate: "2026-10-29", createdAt: at("2026-11-02T03:51:21Z") },
  { id: "oct31-congrats", detectedDate: null, createdAt: at("2026-11-02T04:18:40Z") },
  { id: "oct31-view", detectedDate: "2026-10-31", createdAt: at("2026-11-02T04:18:41Z") },
];

describe("uploadsForSession", () => {
  it("links only the screenshots dated the live's day, plus their undated batch-mates", () => {
    // 31/10 live started 22:20 MYT (14:20 UTC).
    expect(uploadsForSession(uploads, at("2026-10-31T14:20:59Z"))).toEqual([
      "oct31-view",
      "oct31-congrats",
    ]);
  });

  it("uses the Malaysia-time day, not UTC", () => {
    // 30/10 23:30 UTC = 31/10 07:30 MYT.
    expect(uploadsForSession(uploads, at("2026-10-30T23:30:00Z"))).toContain("oct31-view");
  });

  it("matches month+day when the AI misread the year", () => {
    const misread = [{ id: "x", detectedDate: "2024-10-29", createdAt: at("2026-11-02T03:51:21Z") }];
    expect(uploadsForSession(misread, at("2026-10-29T13:09:16Z"))).toEqual(["x"]);
  });

  it("links nothing for a live with no start time or no matching date", () => {
    expect(uploadsForSession(uploads, null)).toEqual([]);
    expect(uploadsForSession(uploads, at("2026-10-25T13:00:00Z"))).toEqual([]);
  });
});
