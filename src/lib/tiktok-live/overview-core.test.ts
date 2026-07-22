import { describe, expect, it } from "vitest";
import type { AnalysisSession } from "./live-analysis-core";
import {
  AUTO_FIELDS,
  TYPED_FIELDS,
  buildRateChart,
  byPartOfDay,
  chaseList,
  connectorMisses,
  coverage,
  dailyAverage,
  handlesWithLeads,
  hours,
  pooledRate,
  productCombos,
  streamerRows,
  topLives,
} from "./overview-core";

let seq = 0;
const mk = (over: Partial<AnalysisSession> = {}): AnalysisSession => ({
  id: `s${++seq}`,
  accountId: "acct-1",
  handle: "adminain111",
  startedAt: "2026-07-14T12:00:00Z", // 8pm MYT
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

/** n identical lives — enough to clear the small-sample guards. */
const many = (n: number, over: Partial<AnalysisSession> = {}) =>
  Array.from({ length: n }, () => mk(over));

describe("pooledRate", () => {
  it("is pairwise: a live missing the numerator contributes NEITHER part", () => {
    // The trap this exists to close. 5 lives have 10 leads over 1h each. Five
    // more were streamed for 1h but nobody recorded their leads. Dividing the
    // 50 leads by all 10 hours would report 5/hr — half the true rate.
    const rows = [...many(5), ...many(5, { totalLeads: null })];
    const r = pooledRate(rows, (s) => s.totalLeads, hours);
    expect(r.value).toBe(10);
    expect(r.lives).toBe(5);
  });

  it("is a ratio of sums, so a tiny live cannot outvote a huge one", () => {
    const r = pooledRate(
      [
        mk({ totalLeads: 1, totalViews: 10 }), // 100 per 1k views
        ...many(4, { totalLeads: 10, totalViews: 10_000 }), // 1 per 1k views
      ],
      (s) => s.totalLeads,
      (s) => s.totalViews,
      { scale: 1000 }
    );
    // Ratio of sums = 41/40010*1000 = 1.02. The mean of per-live ratios would
    // be ~20.8 — twenty times higher, driven entirely by one 10-view live.
    expect(r.value).toBeCloseTo(1, 0);
  });

  it("returns null (not 0, not Infinity) when the denominator is absent", () => {
    const r = pooledRate(many(6, { durationSeconds: 0 }), (s) => s.totalLeads, hours);
    expect(r.value).toBeNull();
    expect(r.lives).toBe(0);
  });

  it("below the minimum sample it declines to answer", () => {
    expect(pooledRate(many(4), (s) => s.totalLeads, hours).value).toBeNull();
    expect(pooledRate(many(5), (s) => s.totalLeads, hours).value).toBe(10);
  });

  it("names the handles a rate actually rests on", () => {
    const r = pooledRate(
      [...many(5), ...many(3, { handle: "mekaniktuax", totalLeads: null })],
      (s) => s.totalLeads,
      hours
    );
    expect(r.handles).toEqual(["adminain111"]); // NOT both
  });
});

describe("coverage", () => {
  it("a typed field is measured by whether a human entered it", () => {
    const rows = [...many(3), ...many(7, { totalLeads: null })];
    const c = coverage(rows, TYPED_FIELDS).find((f) => f.key === "totalLeads")!;
    expect(c.filled).toBe(3);
    expect(c.total).toBe(10);
    expect(c.pct).toBe(30);
  });

  it("an auto field NEVER reports 100% just because the column is NOT NULL", () => {
    // total_views is NOT NULL DEFAULT 0, so "is it null?" is always false and a
    // null-test would certify 100% coverage on lives that captured nothing.
    const c = coverage(many(10, { totalViews: 0 }), AUTO_FIELDS).find(
      (f) => f.key === "totalViews"
    )!;
    expect(c.filled).toBe(0);
    expect(c.kind).toBe("auto");
  });

  it("withholds a percentage when there are too few lives to justify one", () => {
    const c = coverage(many(4), TYPED_FIELDS)[0];
    expect(c.pct).toBeNull();
    expect(c.filled).toBe(4); // the raw counts are still available
  });

  it("product tags count as covered only when the array is non-empty", () => {
    const c = coverage(
      [...many(2, { products: ["KK"] }), ...many(8, { products: [] })],
      TYPED_FIELDS
    ).find((f) => f.key === "products")!;
    expect(c.filled).toBe(2);
  });
});

describe("dailyAverage", () => {
  it("divides by DAYS that had a live, not by the number of lives", () => {
    // Two lives on the same day, one the next day: 3 lives across 2 days.
    const rows = [
      mk({ startedAt: "2026-07-14T10:00:00Z", totalViews: 100 }),
      mk({ startedAt: "2026-07-14T13:00:00Z", totalViews: 200 }),
      mk({ startedAt: "2026-07-15T10:00:00Z", totalViews: 300 }),
    ];
    const a = dailyAverage(rows, (s) => s.totalViews);
    expect(a.days).toBe(2);
    expect(a.lives).toBe(3);
    expect(a.value).toBe(300); // 600 / 2 days — NOT 600 / 3 lives
  });

  it("groups days in Malaysia time, not UTC", () => {
    // 20:00Z on the 14th is 04:00 MYT on the 15th — one MYT day, not two.
    const a = dailyAverage(
      [
        mk({ startedAt: "2026-07-14T20:00:00Z", totalViews: 100 }),
        mk({ startedAt: "2026-07-14T21:00:00Z", totalViews: 100 }),
      ],
      (s) => s.totalViews
    );
    expect(a.days).toBe(1);
    expect(a.value).toBe(200);
  });

  it("ignores lives with the metric unrecorded, in both parts of the ratio", () => {
    // A blank day must not quietly become a zero that drags the average down.
    const a = dailyAverage(
      [
        mk({ startedAt: "2026-07-14T10:00:00Z", totalViews: 500 }),
        mk({ startedAt: "2026-07-15T10:00:00Z", totalViews: null }),
      ],
      (s) => s.totalViews
    );
    expect(a.days).toBe(1);
    expect(a.value).toBe(500); // not 250
  });

  it("returns null rather than dividing by zero", () => {
    expect(dailyAverage([], (s) => s.totalViews).value).toBeNull();
    expect(
      dailyAverage(many(3, { totalViews: null }), (s) => s.totalViews).value
    ).toBeNull();
  });
});

describe("streamerRows", () => {
  const mixed = [
    ...many(6, { accountId: "a", handle: "adminain111", totalLeads: 10 }),
    ...many(4, {
      accountId: "b",
      handle: "mekaniktuax",
      totalLeads: null,
      filteredLeads: null,
    }),
  ];

  it("reports a handle with no recorded leads as null, never zero", () => {
    const rows = streamerRows(mixed);
    const quiet = rows.find((r) => r.handle === "mekaniktuax")!;
    expect(quiet.totalLeads).toBeNull(); // a 0 here reads as "converts nobody"
    expect(quiet.leadsPerHour).toBeNull();
    expect(quiet.qualityRate).toBeNull();
    expect(quiet.livesWithLeads).toBe(0);
    expect(quiet.lives).toBe(4); // but its reach is still reported
    expect(quiet.viewsPerHour).toBe(500);
  });

  it("sorts by lives, never by a lead column", () => {
    expect(streamerRows(mixed).map((r) => r.handle)).toEqual([
      "adminain111",
      "mekaniktuax",
    ]);
  });

  it("computes each handle's rates only from its own lives", () => {
    const rows = streamerRows(mixed);
    const busy = rows.find((r) => r.handle === "adminain111")!;
    expect(busy.totalLeads).toBe(60);
    expect(busy.leadsPerHour).toBe(10);
    expect(busy.liveHours).toBe(6);
  });
});

describe("handlesWithLeads", () => {
  it("separates handles that report leads from those that never have", () => {
    const r = handlesWithLeads([
      ...many(2, { handle: "adminain111", totalLeads: 5 }),
      ...many(3, { handle: "mekaniktuax", totalLeads: null }),
    ]);
    expect(r.withLeads).toEqual(["adminain111"]);
    expect(r.withoutLeads).toEqual([{ handle: "mekaniktuax", lives: 3 }]);
  });
});

describe("byPartOfDay", () => {
  it("buckets on the hour the live STARTED", () => {
    // 12:00Z = 8pm MYT
    expect(byPartOfDay(mk({ startedAt: "2026-07-14T12:00:00Z" }))![0].label).toBe(
      "6pm–9pm"
    );
    // 20:00Z = 4am MYT next day
    expect(byPartOfDay(mk({ startedAt: "2026-07-14T20:00:00Z" }))![0].label).toBe(
      "12am–6am"
    );
  });

  it("has no bucket for a live with no start time", () => {
    expect(byPartOfDay(mk({ startedAt: null }))).toBeNull();
  });
});

describe("buildRateChart", () => {
  it("pools within each bucket and reports the contributing count", () => {
    const rows = buildRateChart(
      [
        // All three start inside 6pm–9pm MYT (= 10:00–13:00 UTC).
        mk({ startedAt: "2026-07-14T10:00:00Z", totalViews: 1000, durationSeconds: 3600 }),
        mk({ startedAt: "2026-07-14T11:00:00Z", totalViews: 2000, durationSeconds: 3600 }),
        mk({ startedAt: "2026-07-14T12:00:00Z", totalViews: null }),
      ],
      byPartOfDay,
      [{ key: "vph", name: "Views per hour", num: (s) => s.totalViews, den: hours }]
    );
    const slot = rows.find((r) => r.label === "6pm–9pm")!;
    expect(slot.vph).toBe(1500); // 3000 views / 2 hours
    expect(slot.n).toBe(3); // three lives in the slot…
    expect(slot.vph_n).toBe(2); // …but only two had views recorded
  });

  it("emits null for a bucket whose denominator is zero", () => {
    const rows = buildRateChart(many(2, { durationSeconds: 0 }), byPartOfDay, [
      { key: "vph", name: "v", num: (s) => s.totalViews, den: hours },
    ]);
    expect(rows[0].vph).toBeNull();
  });
});

describe("topLives", () => {
  it("ignores lives under the 30-minute floor", () => {
    const { best } = topLives([
      mk({ durationSeconds: 600, totalViews: 99_999 }), // 10 min, huge rate
      ...many(4, { durationSeconds: 3600, totalViews: 500 }),
    ]);
    expect(best.every((l) => l.durationMinutes >= 30)).toBe(true);
  });

  it("never lists the same live as both best and weakest", () => {
    const { best, weakest } = topLives(many(6), 5);
    const overlap = best.filter((b) => weakest.some((w) => w.id === b.id));
    expect(overlap).toHaveLength(0);
  });

  it("ranks on views per hour, so a longer live is not automatically better", () => {
    const { best } = topLives([
      mk({ id: "short", durationSeconds: 3600, totalViews: 5000 }),
      ...many(9, { durationSeconds: 36_000, totalViews: 10_000 }),
    ]);
    expect(best[0].id).toBe("short"); // 5000/hr beats 1000/hr
  });
});

describe("chaseList", () => {
  it("skips accidental taps and orders by audience", () => {
    const { rows, totalIncomplete } = chaseList([
      mk({ durationSeconds: 60, totalLeads: null }), // 1 min — not a real live
      mk({ id: "big", durationSeconds: 3600, totalViews: 9000, totalLeads: null }),
      mk({ id: "small", durationSeconds: 3600, totalViews: 100, totalLeads: null }),
    ]);
    expect(totalIncomplete).toBe(2);
    expect(rows.map((r) => r.id)).toEqual(["big", "small"]);
    expect(rows[0].missing).toContain("Total Leads");
  });

  it("flags the pairing that corrupts a quality percentage", () => {
    const { rows } = chaseList([
      mk({ durationSeconds: 3600, totalLeads: null, filteredLeads: 12 }),
    ]);
    expect(rows[0].filteredWithoutTotal).toBe(true);
  });

  it("a fully-filled live is not chased", () => {
    expect(chaseList(many(3)).totalIncomplete).toBe(0);
  });
});

describe("connectorMisses", () => {
  it("flags a live with views but no likes or comments", () => {
    expect(
      connectorMisses([mk({ totalViews: 900, totalLikes: 0, totalComments: 0 })])
    ).toBe(1);
  });

  it("does NOT flag a quiet-but-captured live", () => {
    expect(connectorMisses([mk({ totalLikes: 4, totalComments: 2 })])).toBe(0);
  });
});

describe("productCombos", () => {
  it("counts distinct combinations, so today's data reads as one", () => {
    const r = productCombos([
      ...many(3, { products: ["KK", "Koperasi"] }),
      ...many(2, { products: ["Koperasi", "KK"] }), // same combo, other order
      ...many(5, { products: null }),
    ]);
    expect(r.combos).toBe(1); // → not enough variety for a product chart
    expect(r.tagged).toBe(5);
    expect(r.total).toBe(10);
  });
});
