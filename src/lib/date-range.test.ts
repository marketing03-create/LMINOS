import { describe, expect, it } from "vitest";
import { rangeFromParams } from "./date-range";

describe("rangeFromParams — Malaysia days", () => {
  it("a picked day runs 12:00am to 11:59pm Malaysia time", () => {
    const { range, startStr, endStr } = rangeFromParams({ start: "2026-11-04", end: "2026-11-04" });
    expect(range.start.toISOString()).toBe("2026-11-03T16:00:00.000Z"); // 4 Nov 12:00am MYT
    expect(range.end.toISOString()).toBe("2026-11-04T16:00:00.000Z"); // 5 Nov 12:00am MYT, exclusive
    expect([startStr, endStr]).toEqual(["2026-11-04", "2026-11-04"]);
  });

  it("a 5 Nov 9am message is outside a 4 Nov filter; 4 Nov 1am is inside", () => {
    const { range } = rangeFromParams({ start: "2026-11-04", end: "2026-11-04" });
    const in4 = (iso: string) => +new Date(iso) >= +range.start && +new Date(iso) < +range.end;
    expect(in4("2026-11-05T01:00:00Z")).toBe(false); // 5 Nov 9:00am MYT
    expect(in4("2026-11-03T17:00:00Z")).toBe(true); // 4 Nov 1:00am MYT
  });

  it("presets end with today in Malaysia, even before 8am (still yesterday in UTC)", () => {
    // 7 Nov 2:00am MYT = 6 Nov 18:00 UTC.
    const c = rangeFromParams({ range: "7d" }, new Date("2026-11-06T18:00:00Z"));
    expect([c.startStr, c.endStr]).toEqual(["2026-10-31", "2026-11-07"]);
    expect(c.range.end.toISOString()).toBe("2026-11-07T16:00:00.000Z");
  });
});
