import { describe, expect, it } from "vitest";
import { dailyReport, documentRate, reportCsv, sheetFormula, weekday, type ReportLive } from "./daily-core";

// 9pm MYT = 13:00Z.
const live = (day: string, over: Partial<ReportLive> = {}): ReportLive => ({
  startedAt: new Date(`${day}T13:00:00Z`),
  views: 100,
  comments: 10,
  directMessages: 5,
  whatsapp: null,
  totalLeads: 40,
  documents: 20,
  ...over,
});

describe("dailyReport", () => {
  it("adds up views/comments/DMs, takes the day's Total Leads and Documents once", () => {
    // 26/10: two lives, the streamer typed the day total (74 / 43) into both.
    const [row] = dailyReport(
      [
        live("2026-10-26", { views: 132, comments: 9, directMessages: null, totalLeads: 74, documents: 43 }),
        live("2026-10-26", { views: 1600, comments: 195, directMessages: null, totalLeads: 74, documents: 43 }),
      ],
      "2026-10-26",
      "2026-10-26"
    );
    expect(row).toEqual({
      date: "2026-10-26",
      lives: 2,
      views: 1732,
      comments: 204,
      directMessages: null,
      whatsapp: null,
      totalLeads: 74,
      documents: 43,
    });
  });

  it("keeps Whatsapp blank when untracked, but a real 0 when tracked", () => {
    const rows = dailyReport(
      [live("2026-10-29"), live("2026-10-30", { whatsapp: 0 })],
      "2026-10-29",
      "2026-10-30"
    );
    expect(rows.map((r) => [r.date, r.whatsapp])).toEqual([
      ["2026-10-30", 0],
      ["2026-10-29", null],
    ]);
  });

  it("gives every day a row, newest first; a day without a live is 0 lives and blanks", () => {
    const rows = dailyReport([live("2026-10-31"), live("2026-11-02")], "2026-10-31", "2026-11-02");
    expect(rows.map((r) => r.date)).toEqual(["2026-11-02", "2026-11-01", "2026-10-31"]);
    expect(rows[1]).toMatchObject({ lives: 0, views: null, totalLeads: null });
  });

  it("puts a live on its Malaysia-time day", () => {
    // 1 Nov 23:30 MYT = 1 Nov 15:30Z; 2 Nov 00:30 MYT = 1 Nov 16:30Z.
    const rows = dailyReport(
      [live("x", { startedAt: new Date("2026-11-01T15:30:00Z") }), live("x", { startedAt: new Date("2026-11-01T16:30:00Z") })],
      "2026-11-01",
      "2026-11-02"
    );
    expect(rows.map((r) => [r.date, r.lives])).toEqual([
      ["2026-11-02", 1],
      ["2026-11-01", 1],
    ]);
  });
});

describe("reportCsv", () => {
  it("writes a header and empty cells for blanks", () => {
    const csv = reportCsv(dailyReport([live("2026-10-26", { directMessages: null })], "2026-10-26", "2026-10-26"));
    expect(csv).toBe(
      "Date,Day,Lives,Views,Comment,DM,Whatsapp,Total Leads,Get Documents,Document (%)\n" +
        "2026-10-26,Mon,1,100,10,,,40,20,50%\n"
    );
  });
});

describe("weekday", () => {
  it("names the day", () => {
    expect(weekday("2026-11-05")).toBe("Thu");
    expect(weekday("2026-11-01")).toBe("Sun");
  });
});

describe("documentRate", () => {
  it("is Get Documents ÷ Total Leads, one decimal", () => {
    expect(documentRate(43, 74)).toBe("58.1%");
    expect(documentRate(10, 15)).toBe("66.7%");
  });
  it("is blank when either is missing or there were no leads", () => {
    expect(documentRate(null, 74)).toBeNull();
    expect(documentRate(5, null)).toBeNull();
    expect(documentRate(0, 0)).toBeNull();
  });
});

describe("sheetFormula", () => {
  it("wraps IMPORTDATA in QUERY that formats the date and Document (%) columns", () => {
    expect(sheetFormula("https://x/api/reports/sheet?key=K")).toBe(
      `=QUERY(IMPORTDATA("https://x/api/reports/sheet?key=K"),"select * format Col1 'dd/MM/yyyy', Col10 '0.0%'",1)`
    );
  });
});
