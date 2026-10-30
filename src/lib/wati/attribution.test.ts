import { describe, expect, it } from "vitest";
import {
  attributeContacts,
  cleanCode,
  liveWindows,
  summarize,
  textHasCode,
  type ContactInput,
  type LiveWindowInput,
  type WaLink,
} from "./attribution";

// 30 Oct 2026, MYT = UTC+8. 12:00 MYT = 04:00Z.
const t = (hhmm: string) => new Date(`2026-10-30T${hhmm}:00+08:00`);

const AIN = "acct-ain";
const ABG = "acct-abangduit";
const CONN_AIN = "conn-ainn";
const CONN_ADMIN = "conn-admin";

const live = (id: string, accountId: string, start: string, end: string): LiveWindowInput => ({
  id,
  accountId,
  startedAt: t(start),
  endedAt: t(end),
  durationSeconds: 0,
});

const lives = [
  live("ain-12", AIN, "12:00", "12:45"),
  live("ain-14", AIN, "14:00", "14:40"),
  live("abg-12", ABG, "12:10", "13:00"),
];

const links: WaLink[] = [
  { accountId: AIN, connectionId: CONN_AIN, channelPhone: "60164328160", code: "AIN" },
  { accountId: ABG, connectionId: CONN_ADMIN, channelPhone: "60115581398", code: null },
];

let n = 0;
const contact = (over: Partial<ContactInput>): ContactInput => ({
  id: `c${++n}`,
  connectionId: CONN_AIN,
  channelPhone: "60164328160",
  firstMessageAt: t("12:20"),
  firstMessageText: "hi",
  ...over,
});

describe("liveWindows", () => {
  it("closes a live's window when the same handle goes live again", () => {
    const w = liveWindows(lives);
    expect(w.get("ain-12")).toMatchObject({ start: t("12:00").getTime(), closes: t("14:00").getTime() });
    expect(w.get("ain-14")?.closes).toBe(t("17:40").getTime()); // end + 3h
  });

  it("falls back to duration (min 1h) when the end is missing", () => {
    const w = liveWindows([{ id: "x", accountId: AIN, startedAt: t("12:00"), endedAt: null, durationSeconds: 1800 }]);
    expect(w.get("x")?.closes).toBe(t("16:00").getTime()); // 12:00 + 1h + 3h
  });
});

describe("attributeContacts", () => {
  it("credits a lead on a handle's number to that handle's live", () => {
    const c = contact({ firstMessageAt: t("12:30") });
    expect(attributeContacts(lives, links, [c]).get(c.id)).toBe("ain-12");
  });

  it("moves to the later live once it starts", () => {
    const before = contact({ firstMessageAt: t("13:59") });
    const after = contact({ firstMessageAt: t("14:01") });
    const r = attributeContacts(lives, links, [before, after]);
    expect(r.get(before.id)).toBe("ain-12");
    expect(r.get(after.id)).toBe("ain-14");
  });

  it("keeps each number's leads on its own handle when lives overlap", () => {
    const abg = contact({ connectionId: CONN_ADMIN, channelPhone: "60115581398", firstMessageAt: t("12:30") });
    expect(attributeContacts(lives, links, [abg]).get(abg.id)).toBe("abg-12");
  });

  it("a code wins over the number it arrived on", () => {
    const c = contact({
      connectionId: CONN_ADMIN,
      channelPhone: "60115581398",
      firstMessageText: "Hi AIN, nak tanya loan",
      firstMessageAt: t("12:30"),
    });
    expect(attributeContacts(lives, links, [c]).get(c.id)).toBe("ain-12");
  });

  it("counts nothing before a live starts or after its window", () => {
    const early = contact({ firstMessageAt: t("11:59") });
    const late = contact({ firstMessageAt: t("17:41") });
    const r = attributeContacts(lives, links, [early, late]);
    expect(r.get(early.id)).toBeNull();
    expect(r.get(late.id)).toBeNull();
  });

  it("ignores a number no handle is linked to", () => {
    const other = contact({ channelPhone: "60140000000", firstMessageAt: t("12:30") });
    expect(attributeContacts(lives, links, [other]).get(other.id)).toBeNull();
  });

  it("a link with no number takes every number on its WATI account", () => {
    const anyNumber: WaLink[] = [{ ...links[0], channelPhone: null }];
    const c = contact({ channelPhone: "60140000000", firstMessageAt: t("12:30") });
    expect(attributeContacts(lives, anyNumber, [c]).get(c.id)).toBe("ain-12");
  });
});

describe("codes", () => {
  it("cleans and validates", () => {
    expect(cleanCode(" ain ")).toBe("AIN");
    expect(cleanCode("A")).toBeNull();
    expect(cleanCode("AIN 1")).toBeNull();
    expect(cleanCode(5)).toBeNull();
  });

  it("matches whole words only", () => {
    expect(textHasCode("Hi AIN!", "AIN")).toBe(true);
    expect(textHasCode("ain nak tanya", "AIN")).toBe(true);
    expect(textHasCode("MAINTENANCE", "AIN")).toBe(false);
    expect(textHasCode(null, "AIN")).toBe(false);
  });
});

describe("summarize", () => {
  it("counts replies and takes the median delay", () => {
    const m = (first: string, reply: string | null) => ({
      firstMessageAt: t(first),
      firstReplyAt: reply ? t(reply) : null,
    });
    expect(summarize([m("12:00", "12:04"), m("12:00", "12:10"), m("12:00", null)])).toEqual({
      waLeads: 3,
      replied: 2,
      waiting: 1,
      medianReplyMinutes: 7,
    });
    expect(summarize([])).toEqual({ waLeads: 0, replied: 0, waiting: 0, medianReplyMinutes: null });
  });
});
