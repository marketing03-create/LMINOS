import { describe, expect, it } from "vitest";
import {
  bucketizeDrivers,
  compareWinningVsWeak,
  computeLeadDrivers,
  MIN_SAMPLE,
  sessionToDriverRow,
  spearman,
  verdictFor,
  type DriverScore,
  type DriverSessionInput,
} from "./lead-drivers-core";

const mk = (over: Partial<DriverSessionInput>): DriverSessionInput => ({
  durationSeconds: 3600,
  peakViewers: 50,
  avgViewers: 20,
  totalViews: 500,
  newFollowers: 10,
  totalLikes: 800,
  totalComments: 100,
  totalShares: 5,
  totalLeads: 10,
  filteredLeads: 5,
  ...over,
});

describe("spearman", () => {
  it("returns +1 for a perfectly rising relationship", () => {
    const pairs: [number, number][] = [
      [1, 2],
      [2, 4],
      [3, 9],
      [4, 20],
      [5, 100],
    ];
    expect(spearman(pairs)).toBeCloseTo(1, 5);
  });

  it("returns -1 for a perfectly inverse relationship", () => {
    const pairs: [number, number][] = [
      [1, 50],
      [2, 40],
      [3, 30],
      [4, 20],
      [5, 10],
    ];
    expect(spearman(pairs)).toBeCloseTo(-1, 5);
  });

  it("is robust to one viral outlier (rank-based)", () => {
    // Monotonic apart from scale: the 1,000,000 outlier can't distort ranks.
    const pairs: [number, number][] = [
      [10, 1],
      [20, 2],
      [30, 3],
      [40, 4],
      [1_000_000, 5],
    ];
    expect(spearman(pairs)).toBeCloseTo(1, 5);
  });

  it("returns ~0 when there is no relationship", () => {
    const pairs: [number, number][] = [
      [1, 5],
      [2, 1],
      [3, 9],
      [4, 2],
      [5, 6],
      [6, 4],
    ];
    const s = spearman(pairs);
    expect(s).not.toBeNull();
    expect(Math.abs(s as number)).toBeLessThan(0.5);
  });

  it("returns null below the minimum sample", () => {
    const pairs: [number, number][] = Array.from(
      { length: MIN_SAMPLE - 1 },
      (_, i) => [i, i] as [number, number]
    );
    expect(spearman(pairs)).toBeNull();
  });

  it("returns null when one side never varies", () => {
    const pairs: [number, number][] = [
      [7, 1],
      [7, 2],
      [7, 3],
      [7, 4],
      [7, 5],
    ];
    expect(spearman(pairs)).toBeNull();
  });

  it("handles ties without blowing up", () => {
    const pairs: [number, number][] = [
      [1, 1],
      [2, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ];
    const s = spearman(pairs);
    expect(s).not.toBeNull();
    expect(s as number).toBeGreaterThan(0.8);
  });
});

describe("sessionToDriverRow", () => {
  it("derives duration minutes and per-100-view rates", () => {
    const r = sessionToDriverRow(
      mk({ durationSeconds: 5400, totalViews: 1000, totalComments: 50, totalLikes: 200 })
    );
    expect(r.durationMinutes).toBe(90);
    expect(r.commentsPerView).toBeCloseTo(5);
    expect(r.likesPerView).toBeCloseTo(20);
  });

  it("null views → null rates (no divide-by-zero)", () => {
    const r = sessionToDriverRow(mk({ totalViews: 0 }));
    expect(r.commentsPerView).toBeNull();
    expect(r.likesPerView).toBeNull();
  });
});

describe("computeLeadDrivers", () => {
  it("ranks a truly-correlated metric above a noise metric", () => {
    // Comments track leads perfectly; everything else is shuffled noise.
    const shares = [4, 1, 5, 2, 3, 5, 1, 2];
    const views = [520, 430, 610, 380, 590, 400, 560, 450];
    const likes = [740, 705, 780, 690, 760, 700, 730, 710];
    const peaks = [44, 41, 48, 40, 47, 42, 46, 43];
    const rows = Array.from({ length: 8 }, (_, i) =>
      sessionToDriverRow(
        mk({
          totalComments: (i + 1) * 10,
          totalLeads: (i + 1) * 3,
          filteredLeads: i + 1,
          totalShares: shares[i],
          totalViews: views[i],
          totalLikes: likes[i],
          peakViewers: peaks[i],
        })
      )
    );
    const [total] = computeLeadDrivers(rows);
    expect(total.goal).toBe("totalLeads");
    expect(total.n).toBe(8);
    const comments = total.drivers.find((d) => d.key === "totalComments");
    const sharesD = total.drivers.find((d) => d.key === "totalShares");
    expect(comments?.score).toBeCloseTo(1, 2);
    expect(Math.abs(sharesD?.score ?? 0)).toBeLessThan(0.9);
    // strongest first
    expect(total.drivers[0].key).toBe("totalComments");
  });

  it("skips lives where the goal was never recorded", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) =>
        sessionToDriverRow(mk({ totalComments: i * 10, totalLeads: i }))
      ),
      sessionToDriverRow(mk({ totalLeads: null, filteredLeads: null })),
    ];
    const [total] = computeLeadDrivers(rows);
    expect(total.n).toBe(6);
  });

  it("not-enough-data metrics sink to the bottom with a human verdict", () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      sessionToDriverRow(
        mk({ newFollowers: null, totalComments: i * 10, totalLeads: i })
      )
    );
    const [total] = computeLeadDrivers(rows);
    const nf = total.drivers.find((d) => d.key === "newFollowers");
    expect(nf?.score).toBeNull();
    expect(nf?.verdict).toMatch(/Needs ≥/);
    expect(total.drivers[total.drivers.length - 1].score).toBeNull();
  });
});

describe("bucketizeDrivers", () => {
  const d = (label: string, score: number | null): DriverScore => ({
    key: "totalComments",
    label,
    kind: "raw",
    n: 8,
    score,
    verdict: "",
  });
  it("splits by the ±0.3 threshold, nulls fall into no-clear-effect", () => {
    const b = bucketizeDrivers([
      d("Comments", 0.72),
      d("Peak viewers", 0.31),
      d("Likes", 0.1),
      d("Duration (min)", -0.2),
      d("Views", -0.55),
      d("New followers", null),
    ]);
    expect(b.up).toEqual(["Comments", "Peak viewers"]);
    expect(b.down).toEqual(["Views"]);
    expect(b.flat).toEqual(["Likes", "Duration (min)", "New followers"]);
  });
});

describe("compareWinningVsWeak", () => {
  it("median-splits by the goal and compares averages in real units", () => {
    // 6 lives: top-3 by leads have ~3x the comments of the bottom-3.
    const comments = [120, 110, 130, 40, 50, 45];
    const leads = [30, 25, 28, 5, 8, 6];
    const rows = comments.map((c, i) =>
      sessionToDriverRow(mk({ totalComments: c, totalLeads: leads[i] }))
    );
    const cmp = compareWinningVsWeak(rows, "totalLeads");
    expect(cmp.n).toBe(6);
    expect(cmp.winners).toBe(3);
    expect(cmp.weak).toBe(3);
    const row = cmp.rows.find((r) => r.key === "totalComments");
    expect(row?.winnersAvg).toBeCloseTo(120);
    expect(row?.weakAvg).toBeCloseTo(45);
    expect(row?.note).toMatch(/2\.7× more/);
  });

  it("says 'about the same' when groups match", () => {
    const rows = [50, 50, 50, 50, 50, 50].map((v, i) =>
      sessionToDriverRow(mk({ peakViewers: v, totalLeads: i * 3 }))
    );
    const cmp = compareWinningVsWeak(rows, "totalLeads");
    const row = cmp.rows.find((r) => r.key === "peakViewers");
    expect(row?.note).toBe("about the same");
  });

  it("flags a metric that is LOWER in winning lives", () => {
    // Winning lives are the SMALLER ones (views inverse to leads).
    const views = [200, 250, 220, 900, 950, 880];
    const leads = [30, 25, 28, 4, 5, 3];
    const rows = views.map((v, i) =>
      sessionToDriverRow(mk({ totalViews: v, totalLeads: leads[i] }))
    );
    const cmp = compareWinningVsWeak(rows, "totalLeads");
    const row = cmp.rows.find((r) => r.key === "totalViews");
    expect(row?.note).toMatch(/LOWER/);
  });

  it("returns empty below the minimum sample", () => {
    const rows = [1, 2, 3].map((v) => sessionToDriverRow(mk({ totalLeads: v })));
    const cmp = compareWinningVsWeak(rows, "totalLeads");
    expect(cmp.rows).toEqual([]);
    expect(cmp.n).toBe(3);
  });

  it("odd sample: winners half gets the extra live", () => {
    const rows = [10, 8, 6, 4, 2].map((v, i) =>
      sessionToDriverRow(mk({ totalLeads: v, totalComments: 10 + i }))
    );
    const cmp = compareWinningVsWeak(rows, "totalLeads");
    expect(cmp.winners).toBe(3);
    expect(cmp.weak).toBe(2);
  });

  it("metric missing on most lives → 'not enough data' note", () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      sessionToDriverRow(mk({ newFollowers: null, totalLeads: i * 2 }))
    );
    const cmp = compareWinningVsWeak(rows, "totalLeads");
    const row = cmp.rows.find((r) => r.key === "newFollowers");
    expect(row?.winnersAvg).toBeNull();
    expect(row?.note).toBe("not enough data");
  });
});

describe("verdictFor", () => {
  it("covers the full range in plain English", () => {
    expect(verdictFor(0.8, 10)).toMatch(/Strong driver/);
    expect(verdictFor(0.5, 10)).toMatch(/Helps/);
    expect(verdictFor(0.05, 10)).toMatch(/No real effect/);
    expect(verdictFor(-0.6, 10)).toMatch(/DOWN/);
    expect(verdictFor(null, 2)).toMatch(/Needs ≥/);
    expect(verdictFor(null, 10)).toMatch(/No variation/);
  });
});
