import { describe, expect, it } from "vitest";
import { eventTypeOf, normalizePhone, parseInbound } from "./payload";

const NOW = new Date("2026-10-30T12:00:00Z");

describe("normalizePhone", () => {
  it("makes local, plus and spaced forms the same number", () => {
    expect(normalizePhone("0123456789")).toBe("60123456789");
    expect(normalizePhone("+60 12-345 6789")).toBe("60123456789");
    expect(normalizePhone("60123456789")).toBe("60123456789");
    expect(normalizePhone("0060123456789")).toBe("60123456789");
    expect(normalizePhone(60123456789)).toBe("60123456789");
  });

  it("rejects things that are not phone numbers", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone({})).toBeNull();
  });
});

describe("parseInbound", () => {
  // Shape from WATI's published "message received" sample.
  const sample = {
    id: "64b0c0ffee",
    created: "2026-10-30T11:58:00.000Z",
    whatsappMessageId: "wamid.HBgLNjAxMjM0NTY3ODk",
    conversationId: "64b0c0ff",
    text: "Hi, LIVE-AMY nak tanya pinjaman",
    type: "text",
    timestamp: "1793361480",
    owner: false,
    eventType: "message",
    waId: "60123456789",
    senderName: "Ali",
    channelPhoneNumber: "60198765432",
  };

  it("reads a customer message", () => {
    expect(parseInbound(sample, NOW)).toEqual({
      phone: "60123456789",
      name: "Ali",
      text: "Hi, LIVE-AMY nak tanya pinjaman",
      channelPhone: "60198765432",
      at: new Date(1793361480 * 1000),
    });
  });

  it("accepts the other inbound event names", () => {
    expect(parseInbound({ ...sample, eventType: "messageReceived" }, NOW)?.phone).toBe("60123456789");
    expect(parseInbound({ ...sample, eventType: "newContactMessageReceived" }, NOW)?.phone).toBe("60123456789");
  });

  it("ignores our own messages and receipts", () => {
    expect(parseInbound({ ...sample, owner: true }, NOW)).toBeNull();
    expect(parseInbound({ ...sample, eventType: "sessionMessageSent" }, NOW)).toBeNull();
    expect(parseInbound({ ...sample, eventType: "sentMessageREAD" }, NOW)).toBeNull();
    expect(parseInbound({ ...sample, eventType: undefined }, NOW)).toBeNull();
  });

  it("ignores a message with no usable phone", () => {
    expect(parseInbound({ ...sample, waId: undefined }, NOW)).toBeNull();
    expect(parseInbound({ ...sample, waId: "x" }, NOW)).toBeNull();
  });

  it("falls back from timestamp to created to now", () => {
    expect(parseInbound({ ...sample, timestamp: undefined }, NOW)?.at).toEqual(new Date("2026-10-30T11:58:00.000Z"));
    expect(parseInbound({ ...sample, timestamp: undefined, created: undefined }, NOW)?.at).toEqual(NOW);
    expect(parseInbound({ ...sample, timestamp: String(NOW.getTime() + 3_600_000) }, NOW)?.at).toEqual(NOW);
  });

  it("keeps media messages (no text) and trims long text", () => {
    expect(parseInbound({ ...sample, text: null, type: "image" }, NOW)?.text).toBeNull();
    expect(parseInbound({ ...sample, text: "a".repeat(900) }, NOW)?.text).toHaveLength(500);
  });

  it("survives junk bodies", () => {
    expect(parseInbound(null, NOW)).toBeNull();
    expect(parseInbound("hello", NOW)).toBeNull();
    expect(eventTypeOf([])).toBeNull();
  });
});
