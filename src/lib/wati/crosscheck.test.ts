import { describe, expect, it } from "vitest";
import {
  classifyChat,
  customerWroteBetween,
  inWorkingHours,
  isQuiet,
  mytDayBounds,
  mytYesterday,
  looksSynced,
  splitMassSync,
  watiDateParam,
  webhookSilent,
} from "./crosscheck-core";
import type { WatiMessage } from "./history";

const msg = (at: string, owner: boolean, eventType: string | null = "message"): WatiMessage => ({
  at: new Date(at),
  owner,
  eventType,
  template: false,
  broadcast: false,
  bot: false,
  operator: null,
  text: null,
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

describe("customerWroteBetween / mytDayBounds", () => {
  const { start, end } = mytDayBounds("2026-11-06");
  it("bounds a Malaysia day", () => {
    expect(new Date(start).toISOString()).toBe("2026-11-05T16:00:00.000Z");
    expect(end - start).toBe(86_400_000);
  });
  it("finds the customer's first message that day only", () => {
    const items = [
      msg("2026-11-05T15:59:00Z", false), // 5 Nov 11:59pm MYT — the day before
      msg("2026-11-06T03:00:00Z", true), // our message
      msg("2026-11-06T04:00:00Z", false),
      msg("2026-11-06T02:00:00Z", false, "ticket"),
    ];
    expect(customerWroteBetween(items, start, end)?.toISOString()).toBe("2026-11-06T04:00:00.000Z");
  });
  it("is null when they only wrote on other days", () => {
    expect(customerWroteBetween([msg("2026-11-05T10:00:00Z", false)], start, end)).toBeNull();
  });
});

describe("splitMassSync", () => {
  const at = (iso: string) => Date.parse(iso);
  // 5 Nov 4pm MYT = 08:00Z. 600 sync-looking contacts touched in that hour.
  const synced = Array.from({ length: 600 }, (_, i) => ({
    phone: `6011000${String(i).padStart(4, "0")}`,
    name: null,
    synced: true,
    lastUpdated: at("2026-11-05T08:10:00Z"),
  }));
  const chattedLater = { phone: "60119990001", name: "Siti", synced: true, lastUpdated: at("2026-11-05T14:00:00Z") };
  const realInBurst = { phone: "60119990002", name: null, synced: false, lastUpdated: at("2026-11-05T08:20:00Z") };

  it("skips sync-looking contacts touched in a mass-sync hour", () => {
    const r = splitMassSync([...synced, chattedLater, realInBurst]);
    expect(r.skipped).toHaveLength(600);
    expect(r.bursts).toEqual([{ hour: "2026-11-05 16:00", count: 600 }]);
  });
  it("still reads a synced contact who chatted later, and other contacts touched in the burst hour", () => {
    const r = splitMassSync([...synced, chattedLater, realInBurst]);
    expect(r.keep.map((c) => c.phone)).toEqual(["60119990001", "60119990002"]);
  });
  it("skips nothing on a normal day", () => {
    expect(splitMassSync(synced.slice(0, 40)).skipped).toHaveLength(0);
  });
  it("only WhatsApp Business App contacts not confirmed look synced", () => {
    expect(looksSynced("WhatsApp Business App", "UNCONFIRMED")).toBe(true);
    expect(looksSynced("WhatsApp Business App", "VALID")).toBe(false);
    expect(looksSynced("WhatsApp", "UNCONFIRMED")).toBe(false);
  });
});

describe("webhookSilent", () => {
  const now = new Date("2026-11-12T08:00:00Z");
  it("flags an account WATI hasn't called for an hour or more", () => {
    expect(webhookSilent(new Date("2026-11-11T23:52:00Z"), now)).toBe(true);
    expect(webhookSilent(new Date("2026-11-12T07:00:00Z"), now)).toBe(true);
  });
  it("leaves a busy account alone", () => {
    expect(webhookSilent(new Date("2026-11-12T07:58:00Z"), now)).toBe(false);
  });
  it("never flags an account that was never connected", () => {
    expect(webhookSilent(null, now)).toBe(false);
  });
});
