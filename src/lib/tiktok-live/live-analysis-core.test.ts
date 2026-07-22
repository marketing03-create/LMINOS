import { describe, expect, it } from "vitest";
import {
  aggregate,
  dmsByDate,
  durationByDate,
  hourLabel,
  leadsByHour,
  leadsByProduct,
  mytDate,
  mytHour,
  summaryCards,
  viewsByHour,
  watchByDate,
  type AnalysisSession,
} from "./live-analysis-core";

let seq = 0;
const mk = (over: Partial<AnalysisSession>): AnalysisSession => ({
  id: `s${++seq}`,
  accountId: "acct-1",
  handle: "adminain111",
  startedAt: "2026-07-14T12:00:00Z", // 8pm MYT, Tue
  durationSeconds: 3600,
  totalViews: 500,
  peakViewers: 50,
  avgViewers: 30,
  avgWatchSeconds: 60,
  directMessages: 20,
  serviceBioViews: 15,
  uniqueViewers: 300,
  newFollowers: 5,
  totalLikes: 900,
  totalComments: 120,
  keywordLeads: 8,
  products: ["KK"],
  totalLeads: 10,
  filteredLeads: 4,
  ...over,
});

describe("aggregate", () => {
  const v = [2, 4, 4, 10];
  it("computes each aggregation", () => {
    expect(aggregate(v, "SUM")).toBe(20);
    expect(aggregate(v, "AVG")).toBe(5);
    expect(aggregate(v, "MIN")).toBe(2);
    expect(aggregate(v, "MAX")).toBe(10);
    expect(aggregate(v, "COUNT")).toBe(4);
    expect(aggregate(v, "MEDIAN")).toBe(4); // (4+4)/2
  });

  it("median of an odd-length set is the middle value", () => {
    expect(aggregate([5, 1, 9], "MEDIAN")).toBe(5);
  });

  it("COUNT of an empty bucket is 0; every other agg is null (a gap, not a zero)", () => {
    expect(aggregate([], "COUNT")).toBe(0);
    for (const a of ["SUM", "AVG", "MIN", "MAX", "MEDIAN"] as const) {
      expect(aggregate([], a)).toBeNull();
    }
  });

  it("does not mutate the caller's array when taking a median", () => {
    const orig = [3, 1, 2];
    aggregate(orig, "MEDIAN");
    expect(orig).toEqual([3, 1, 2]);
  });
});

describe("Malaysia-time helpers", () => {
  it("converts to MYT hour and date (UTC+8)", () => {
    expect(mytHour("2026-07-14T12:00:00Z")).toBe(20);
    expect(mytDate("2026-07-14T12:00:00Z")).toBe("2026-07-14");
    // 18:30 UTC = 02:30 MYT the NEXT day
    expect(mytHour("2026-07-14T18:30:00Z")).toBe(2);
    expect(mytDate("2026-07-14T18:30:00Z")).toBe("2026-07-15");
  });
  it("formats hours", () => {
    expect(hourLabel(0)).toBe("12am");
    expect(hourLabel(12)).toBe("12pm");
    expect(hourLabel(20)).toBe("8pm");
  });
});

describe("durationByDate", () => {
  it("sums minutes per day and orders chronologically", () => {
    const rows = durationByDate(
      [
        mk({ startedAt: "2026-07-15T04:00:00Z", durationSeconds: 1800 }), // 30m
        mk({ startedAt: "2026-07-15T06:00:00Z", durationSeconds: 900 }), // 15m
        mk({ startedAt: "2026-07-14T04:00:00Z", durationSeconds: 3600 }), // 60m
      ],
      "SUM"
    );
    expect(rows.map((r) => r.label)).toEqual(["2026-07-14", "2026-07-15"]);
    expect(rows[0].duration).toBe(60);
    expect(rows[1].duration).toBe(45);
    expect(rows[1].n).toBe(2);
  });

  it("AVG gives per-live minutes for that day", () => {
    const rows = durationByDate(
      [
        mk({ startedAt: "2026-07-15T04:00:00Z", durationSeconds: 1800 }),
        mk({ startedAt: "2026-07-15T06:00:00Z", durationSeconds: 900 }),
      ],
      "AVG"
    );
    expect(rows[0].duration).toBe(22.5);
  });
});

describe("viewsByHour", () => {
  it("buckets by MYT hour, ordered by time of day", () => {
    const rows = viewsByHour(
      [
        mk({ startedAt: "2026-07-14T12:00:00Z", totalViews: 600 }), // 8pm
        mk({ startedAt: "2026-07-14T12:30:00Z", totalViews: 400 }), // 8pm
        mk({ startedAt: "2026-07-14T04:00:00Z", totalViews: 100 }), // 12pm
      ],
      "AVG"
    );
    expect(rows.map((r) => r.label)).toEqual(["12pm", "8pm"]);
    expect(rows[1].views).toBe(500);
  });
});

describe("watchByDate / dmsByDate", () => {
  it("averages watch seconds per day, chronologically", () => {
    const rows = watchByDate(
      [
        mk({ startedAt: "2026-07-15T04:00:00Z", avgWatchSeconds: 40 }),
        mk({ startedAt: "2026-07-15T06:00:00Z", avgWatchSeconds: 80 }),
        mk({ startedAt: "2026-07-14T04:00:00Z", avgWatchSeconds: 30 }),
      ],
      "AVG"
    );
    expect(rows.map((r) => r.label)).toEqual(["2026-07-14", "2026-07-15"]);
    expect(rows[0].watch).toBe(30);
    expect(rows[1].watch).toBe(60);
  });

  it("sums direct messages per day", () => {
    const rows = dmsByDate(
      [
        mk({ startedAt: "2026-07-14T04:00:00Z", directMessages: 12 }),
        mk({ startedAt: "2026-07-14T06:00:00Z", directMessages: 8 }),
      ],
      "SUM"
    );
    expect(rows[0].dms).toBe(20);
    expect(rows[0].n).toBe(2);
  });

  it("a day with the metric unrecorded is a gap, not a zero", () => {
    const rows = watchByDate(
      [mk({ startedAt: "2026-07-14T04:00:00Z", avgWatchSeconds: null })],
      "AVG"
    );
    expect(rows[0].watch).toBeNull();
    expect(rows[0].n).toBe(1);
  });
});

describe("leadsByProduct", () => {
  it("buckets a multi-product live ONCE, under its combination", () => {
    // Regression: this used to emit a bucket per tag, so buildChart credited the
    // same 12 leads to both "KK" and "Koperasi" and the bars totalled double.
    const rows = leadsByProduct(
      [
        mk({ products: ["KK", "Koperasi"], totalLeads: 12, filteredLeads: 6 }),
        mk({ products: ["KK"], totalLeads: 8, filteredLeads: 2 }),
        mk({ products: null, totalLeads: 3, filteredLeads: 1 }),
      ],
      "SUM"
    );
    expect(rows.find((r) => r.label === "KK + Koperasi")?.totalLeads).toBe(12);
    expect(rows.find((r) => r.label === "KK")?.totalLeads).toBe(8);
    expect(rows.find((r) => r.label === "Koperasi")).toBeUndefined();
    // Every live counted exactly once, so the bars add up to the period total.
    const plotted = rows.reduce((t, r) => t + ((r.totalLeads as number) ?? 0), 0);
    expect(plotted).toBe(23);
    expect(rows[rows.length - 1].label).toBe("Untagged");
  });

  it("tag ORDER cannot split one combination into two bars", () => {
    const rows = leadsByProduct(
      [
        mk({ products: ["KK", "Koperasi"], totalLeads: 5, filteredLeads: 1 }),
        mk({ products: ["Koperasi", "KK"], totalLeads: 7, filteredLeads: 2 }),
      ],
      "SUM"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("KK + Koperasi");
    expect(rows[0].totalLeads).toBe(12);
  });

  it("busiest product comes first", () => {
    const rows = leadsByProduct(
      [
        mk({ products: ["KK"] }),
        mk({ products: ["KK"] }),
        mk({ products: ["Koperasi"] }),
      ],
      "SUM"
    );
    expect(rows[0].label).toBe("KK");
  });

  it("reports how many lives actually contributed each series", () => {
    const rows = leadsByProduct(
      [
        mk({ products: ["KK"], totalLeads: 10 }),
        mk({ products: ["KK"], totalLeads: null }),
      ],
      "SUM"
    );
    expect(rows[0].n).toBe(2); // two lives in the bucket…
    expect(rows[0].totalLeads_n).toBe(1); // …but only one had the number
  });
});

describe("leadsByHour", () => {
  it("shows both lead series per time slot", () => {
    const rows = leadsByHour(
      [
        mk({ startedAt: "2026-07-14T12:00:00Z", totalLeads: 10, filteredLeads: 5 }),
        mk({ startedAt: "2026-07-14T12:10:00Z", totalLeads: 20, filteredLeads: 5 }),
      ],
      "SUM"
    );
    expect(rows[0].label).toBe("8pm");
    expect(rows[0].totalLeads).toBe(30);
    expect(rows[0].filteredLeads).toBe(10);
  });

  it("a blank metric is skipped, not counted as zero", () => {
    const rows = leadsByHour(
      [
        mk({ startedAt: "2026-07-14T12:00:00Z", totalLeads: 10 }),
        mk({ startedAt: "2026-07-14T12:10:00Z", totalLeads: null }),
      ],
      "AVG"
    );
    expect(rows[0].totalLeads).toBe(10); // not 5
    expect(rows[0].n).toBe(2); // but both lives are in the bucket
  });
});

describe("summaryCards", () => {
  it("totals leads and computes the quality rate", () => {
    const s = summaryCards([
      mk({ totalLeads: 200, filteredLeads: 100 }),
      mk({ totalLeads: 168, filteredLeads: 55 }),
      mk({ totalLeads: 0, filteredLeads: 0 }),
      mk({ totalLeads: 0, filteredLeads: 0 }),
      mk({ totalLeads: 0, filteredLeads: 0 }),
    ]);
    expect(s.totalLeads).toBe(368);
    expect(s.filteredLeads).toBe(155);
    expect(s.qualityRate).toBe(42.1); // matches the spec's worked example
    expect(s.livesWithLeads).toBe(5);
  });

  it("a live with Filtered but no Total cannot inflate the quality rate", () => {
    // The production bug: filtered was summed independently of total, so this
    // row added 500 to the numerator against a denominator it never joined —
    // pushing the rate over 100%. There is one such live in the real data.
    const paired = [
      mk({ totalLeads: 100, filteredLeads: 40 }),
      mk({ totalLeads: 100, filteredLeads: 40 }),
      mk({ totalLeads: 100, filteredLeads: 40 }),
      mk({ totalLeads: 100, filteredLeads: 40 }),
      mk({ totalLeads: 100, filteredLeads: 40 }),
    ];
    const clean = summaryCards(paired);
    const polluted = summaryCards([
      ...paired,
      mk({ totalLeads: null, filteredLeads: 500 }),
    ]);
    expect(clean.qualityRate).toBe(40);
    expect(polluted.qualityRate).toBe(40); // unmoved
    expect(polluted.qualityRate!).toBeLessThanOrEqual(100);
    // …though the headline sum still reports every recorded figure.
    expect(polluted.filteredLeads).toBe(700);
    expect(polluted.livesWithBoth).toBe(5);
  });

  it("too few paired lives → null rather than a percentage off 2 lives", () => {
    const s = summaryCards([
      mk({ totalLeads: 200, filteredLeads: 100 }),
      mk({ totalLeads: 168, filteredLeads: 55 }),
    ]);
    expect(s.livesWithBoth).toBe(2);
    expect(s.qualityRate).toBeNull();
    expect(s.totalLeads).toBe(368); // the totals are still reported
  });

  it("computes the reach + time cards from the same rows", () => {
    const s = summaryCards([
      mk({ totalViews: 600, peakViewers: 40, durationSeconds: 1800 }),
      mk({ totalViews: 400, peakViewers: 60, durationSeconds: 5400 }),
    ]);
    expect(s.sessions).toBe(2);
    expect(s.totalViews).toBe(1000);
    expect(s.avgPeakViewers).toBe(50);
    expect(s.liveHours).toBe(2); // (1800 + 5400) / 3600
  });

  it("no leads yet → null rate rather than a divide-by-zero", () => {
    const s = summaryCards([mk({ totalLeads: null, filteredLeads: null })]);
    expect(s.totalLeads).toBe(0);
    expect(s.qualityRate).toBeNull();
    expect(s.livesWithLeads).toBe(0);
  });

  it("blank peak viewers → null rather than a zero average", () => {
    const s = summaryCards([mk({ peakViewers: null })]);
    expect(s.avgPeakViewers).toBeNull();
    expect(s.sessions).toBe(1);
  });
});
