import { describe, expect, it } from "vitest";
import { analyzeHistory, parseMessages, type WatiMessage } from "./history";

const t = (hms: string) => new Date(`2026-10-30T${hms}Z`);
const msg = (at: string, over: Partial<WatiMessage> = {}): WatiMessage => ({
  at: t(at),
  owner: false,
  eventType: "message",
  template: false,
  broadcast: false,
  bot: false,
  operator: null,
  ...over,
});

describe("analyzeHistory", () => {
  it("finds the first reply after the lead's first message", () => {
    const r = analyzeHistory(
      [msg("08:36:34"), msg("08:36:47", { owner: true }), msg("08:42:16", { owner: true })],
      t("08:36:33")
    );
    expect(r.firstReply).toEqual({ at: t("08:36:47"), by: null });
  });

  it("skips an instant automatic greeting with no operator", () => {
    const r = analyzeHistory(
      [msg("08:00:00"), msg("08:00:02", { owner: true }), msg("08:05:00", { owner: true })],
      t("08:00:00")
    );
    expect(r.firstReply?.at).toEqual(t("08:05:00"));
  });

  it("a named operator counts however fast", () => {
    const r = analyzeHistory(
      [msg("08:00:00"), msg("08:00:03", { owner: true, operator: "Ain" })],
      t("08:00:00")
    );
    expect(r.firstReply).toEqual({ at: t("08:00:03"), by: "Ain" });
  });

  it("ignores templates, broadcasts, bots and ticket events", () => {
    const r = analyzeHistory(
      [
        msg("08:00:00"),
        msg("08:01:00", { owner: true, template: true }),
        msg("08:02:00", { owner: true, broadcast: true }),
        msg("08:03:00", { owner: true, bot: true }),
        msg("08:04:00", { owner: true, eventType: "ticket" }),
      ],
      t("08:00:00")
    );
    expect(r.firstReply).toBeNull();
  });

  it("our message sent before the customer wrote is not a reply", () => {
    const r = analyzeHistory([msg("08:16:46", { owner: true }), msg("08:17:20")], t("08:17:19"));
    expect(r.firstReply).toBeNull();
  });

  it("finds a returning customer's real first contact, but times the reply from today", () => {
    const yesterday = { ...msg("00:00:00"), at: new Date("2026-10-29T10:49:52Z") };
    const r = analyzeHistory(
      [
        msg("08:31:00", { owner: true }),
        msg("08:20:51"),
        msg("03:06:14", { owner: true }),
        yesterday,
      ],
      t("08:20:51")
    );
    expect(r.firstContactAt).toEqual(new Date("2026-10-29T10:49:52Z"));
    // Not this morning's 03:06 message (that answered yesterday's question).
    expect(r.firstReply?.at).toEqual(t("08:31:00"));
  });

  it("keeps our first message when the history has nothing older", () => {
    expect(analyzeHistory([msg("09:00:00")], t("08:59:59")).firstContactAt).toEqual(t("08:59:59"));
  });
});

describe("parseMessages", () => {
  it("reads WATI's list and pagination", () => {
    const r = parseMessages({
      result: "success",
      messages: {
        hasNextPage: true,
        items: [
          { created: "2026-10-30T08:36:47Z", owner: true, eventType: "message", operatorName: null, botType: null },
          { created: "2026-10-29T10:49:53.447Z", eventType: "ticket", type: 1 },
          { timestamp: "1793348451", owner: false, eventType: "message", templateId: "tpl1" },
          { nothing: true },
        ],
      },
    });
    expect(r.complete).toBe(false);
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({ owner: true, operator: null, eventType: "message" });
    expect(r.items[2]).toMatchObject({ owner: false, template: true, at: new Date(1793348451 * 1000) });
  });

  it("survives errors and odd bodies", () => {
    expect(parseMessages({ result: false, info: "Can't find Conversation" }).items).toEqual([]);
    expect(parseMessages(null).items).toEqual([]);
  });
});
