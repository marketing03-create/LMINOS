import { describe, expect, it } from "vitest";
import { classifyChat, inWorkingHours, isQuiet, mytYesterday, watiDateParam } from "./crosscheck-core";
import type { WatiMessage } from "./history";

const msg = (at: string, owner: boolean, eventType: string | null = "message"): WatiMessage => ({
  at: new Date(at),
  owner,
  eventType,
  template: false,
  broadcast: false,
  bot: false,
  operator: null,
});

describe("cross-check: is this WATI contact a customer TT Stars should have?", () => {
  const connected = new Date("2026-10-30T06:24:00Z");

  it("a customer who wrote after TT Stars was connected is one", () => {
    const v = classifyChat([msg("2026-11-01T03:00:00Z", true), msg("2026-11-01T02:00:00Z", false)], connected);
    expect(v).toEqual({ kind: "customer", firstInboundAt: new Date("2026-11-01T02:00:00Z") });
  });

  it("a chat CS started, with no customer message, is not", () => {
    expect(classifyChat([msg("2026-11-01T03:00:00Z", true)], connected).kind).toBe("not-customer");
  });

  it("a customer who only wrote before TT Stars was connected is not", () => {
    expect(classifyChat([msg("2026-10-29T03:00:00Z", false)], connected).kind).toBe("not-customer");
  });

  it("ticket events don't count as messages", () => {
    expect(classifyChat([msg("2026-11-01T03:00:00Z", false, "ticket")], connected).kind).toBe("not-customer");
  });

  it("dates", () => {
    expect(watiDateParam("2026-11-01")).toBe("11-01-2026");
    // 1am Malaysia on 3 Nov is still 2 Nov in UTC; yesterday is 2 Nov.
    expect(mytYesterday(new Date("2026-11-02T17:00:00Z"))).toBe("2026-11-02");
  });
});

describe("quiet WhatsApp alert", () => {
  const now = new Date("2026-11-02T08:00:00Z"); // 4pm Malaysia

  it("flags a busy account silent for 3h+ in working hours", () => {
    expect(inWorkingHours(now)).toBe(true);
    expect(isQuiet(new Date("2026-11-02T04:30:00Z"), 40, now)).toBe(true);
    expect(isQuiet(new Date("2026-11-02T06:30:00Z"), 40, now)).toBe(false);
  });

  it("ignores accounts that are rarely used or never heard from", () => {
    expect(isQuiet(new Date("2026-11-01T00:00:00Z"), 2, now)).toBe(false);
    expect(isQuiet(null, 0, now)).toBe(false);
  });

  it("stays quiet at night", () => {
    expect(inWorkingHours(new Date("2026-11-02T16:00:00Z"))).toBe(false); // midnight MYT
  });
});
