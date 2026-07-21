import { describe, expect, it } from "vitest";
import {
  ScreenshotExtractionSchema,
  buildScreenshotPrompt,
  extractionToValues,
  mergeExtractions,
  SCREENSHOT_SYSTEM,
  splitByBucket,
  type ScreenshotExtraction,
} from "./screenshot-extract-core";

function ext(over: Partial<ScreenshotExtraction>): ScreenshotExtraction {
  return {
    date: null,
    startTime: null,
    durationMinutes: null,
    handle: null,
    tab: "other",
    totalViews: null,
    uniqueViewers: null,
    activeViewers: null,
    peakConcurrentViewers: null,
    avgConcurrentViewers: null,
    avgWatchSeconds: null,
    newFollowers: null,
    comments: null,
    likes: null,
    shares: null,
    directMessages: null,
    serviceBioViews: null,
    interestedViewers: null,
    diamonds: null,
    ...over,
  };
}

describe("ScreenshotExtractionSchema", () => {
  it("accepts a full Viewership extraction", () => {
    const r = ScreenshotExtractionSchema.safeParse(
      ext({
        date: "2026-06-10",
        startTime: "12:55",
        durationMinutes: 51,
        handle: "adminain1",
        tab: "viewership",
        totalViews: 775,
        uniqueViewers: 679,
        activeViewers: 45,
        peakConcurrentViewers: 46,
        avgConcurrentViewers: 23,
        avgWatchSeconds: 52,
      })
    );
    expect(r.success).toBe(true);
  });

  it("accepts a sparse Diamonds extraction (most fields null)", () => {
    expect(
      ScreenshotExtractionSchema.safeParse(ext({ tab: "diamonds", diamonds: 0 })).success
    ).toBe(true);
  });

  it("rejects an unknown tab", () => {
    expect(ScreenshotExtractionSchema.safeParse(ext({ tab: "gifts" as never })).success).toBe(false);
  });

  it("rejects a non-integer metric", () => {
    expect(
      ScreenshotExtractionSchema.safeParse(ext({ totalViews: 12.5 })).success
    ).toBe(false);
  });
});

describe("extractionToValues", () => {
  it("maps screenshot fields to DB columns and skips nulls", () => {
    const v = extractionToValues(
      ext({
        totalViews: 775,
        peakConcurrentViewers: 46,
        avgConcurrentViewers: 23,
        likes: 3100,
        comments: 124,
        uniqueViewers: 679,
        avgWatchSeconds: 52,
        diamonds: 0,
      })
    );
    expect(v).toEqual({
      totalViews: 775,
      peakViewers: 46, // peakConcurrentViewers → peakViewers
      avgViewers: 23, // avgConcurrentViewers → avgViewers
      totalLikes: 3100, // likes → totalLikes
      totalComments: 124, // comments → totalComments
      uniqueViewers: 679,
      avgWatchSeconds: 52,
      diamonds: 0,
    });
  });
});

describe("splitByBucket", () => {
  it("separates captured (auto) corrections from manual extras", () => {
    const { auto, manual } = splitByBucket({
      totalViews: 775,
      totalLikes: 3100,
      uniqueViewers: 679,
      diamonds: 0,
      avgWatchSeconds: 52,
    });
    expect(auto).toEqual({ totalViews: 775, totalLikes: 3100 });
    expect(manual).toEqual({ uniqueViewers: 679, diamonds: 0, avgWatchSeconds: 52 });
  });
});

describe("mergeExtractions", () => {
  it("merges two tabs of the same live by date (first non-null wins)", () => {
    const groups = mergeExtractions([
      ext({ date: "2026-06-10", handle: "adminain1", startTime: "12:55", tab: "viewership", totalViews: 775, uniqueViewers: 679 }),
      ext({ date: "2026-06-10", tab: "engagement", likes: 3100, comments: 124, newFollowers: 17 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe("2026-06-10");
    expect(groups[0].handle).toBe("adminain1");
    expect(groups[0].needsAttach).toBe(false);
    expect(groups[0].sourceTabs).toEqual(["viewership", "engagement"]);
    expect(groups[0].values).toMatchObject({
      totalViews: 775,
      uniqueViewers: 679,
      totalLikes: 3100,
      totalComments: 124,
      newFollowers: 17,
    });
  });

  it("folds an undated summary into the sole dated live (one table)", () => {
    const groups = mergeExtractions([
      ext({ date: "2026-06-10", tab: "viewership", totalViews: 775 }),
      ext({
        date: null,
        tab: "congratulations",
        directMessages: 26,
        serviceBioViews: 45,
        interestedViewers: 0,
      }),
    ]);
    // Exactly one dated live → the undated extras merge in; no separate card.
    expect(groups).toHaveLength(1);
    expect(groups[0].needsAttach).toBe(false);
    expect(groups[0].sourceTabs).toContain("congratulations");
    expect(groups[0].values).toMatchObject({
      totalViews: 775,
      directMessages: 26,
      serviceBioViews: 45,
      interestedViewers: 0,
    });
  });

  it("keeps the dated value on overlap when folding an undated summary", () => {
    const groups = mergeExtractions([
      ext({ date: "2026-06-10", tab: "viewership", totalViews: 775, newFollowers: 20 }),
      // LIVE-Centre summary rounds Views to 1000 and repeats followers.
      ext({ date: null, tab: "congratulations", totalViews: 1000, newFollowers: 20, directMessages: 31 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].values.totalViews).toBe(775); // dated wins over the rounded summary
    expect(groups[0].values.directMessages).toBe(31); // unique extra still added
    expect(groups[0].conflicts.join(" ")).toContain("totalViews");
  });

  it("keeps an undated screenshot separate when there are TWO dated lives", () => {
    const groups = mergeExtractions([
      ext({ date: "2026-06-10", tab: "viewership", totalViews: 775 }),
      ext({ date: "2026-06-11", tab: "viewership", totalViews: 900 }),
      ext({ date: null, tab: "congratulations", directMessages: 26 }),
    ]);
    // Ambiguous which live the summary belongs to → stays a needs-attach group.
    expect(groups).toHaveLength(3);
    const undated = groups.find((g) => g.needsAttach);
    expect(undated?.values).toMatchObject({ directMessages: 26 });
    expect(undated?.date).toBeNull();
  });

  it("records a conflict when two tabs disagree on a value", () => {
    const groups = mergeExtractions([
      ext({ date: "2026-06-10", tab: "viewership", totalViews: 775 }),
      ext({ date: "2026-06-10", tab: "other", totalViews: 800 }),
    ]);
    expect(groups[0].values.totalViews).toBe(775); // first wins
    expect(groups[0].conflicts.join(" ")).toContain("totalViews");
  });
});

describe("prompt", () => {
  it("system prompt states the key normalization rules", () => {
    expect(SCREENSHOT_SYSTEM).toContain("TOTAL SECONDS");
    expect(SCREENSHOT_SYSTEM).toContain("Malaysia time");
    expect(buildScreenshotPrompt()).toContain("null");
  });
});
