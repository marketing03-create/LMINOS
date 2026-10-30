import { describe, expect, it } from "vitest";
import {
  countsAsReply,
  eventTypeOf,
  keysOf,
  normalizePhone,
  parseInbound,
  parseOutbound,
} from "./payload";

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

describe("parseOutbound", () => {
  const reply = {
    eventType: "sessionMessageSent",
    waId: "60123456789",
    owner: true,
    text: "Hi, boleh share IC?",
    timestamp: "1793361600",
    operatorName: "Ain",
    operatorEmail: "ain@example.com",
  };

  it("reads a CS reply and who sent it", () => {
    expect(parseOutbound(reply, NOW)).toEqual({
      phone: "60123456789",
      at: new Date(1793361600 * 1000),
      by: "Ain",
      human: true,
      operatorUnknown: false,
    });
  });

  it("treats owner messages and template sends as ours", () => {
    expect(parseOutbound({ ...reply, eventType: "message" }, NOW)?.by).toBe("Ain");
    expect(parseOutbound({ ...reply, eventType: "templateMessageSent" }, NOW)?.by).toBe("Ain");
  });

  it("ignores customer messages and receipts", () => {
    expect(parseOutbound({ ...reply, eventType: "message", owner: false }, NOW)).toBeNull();
    expect(parseOutbound({ ...reply, eventType: "sentMessageREAD" }, NOW)).toBeNull();
    expect(parseOutbound({ ...reply, waId: "x" }, NOW)).toBeNull();
  });

  it("marks automations as not human", () => {
    expect(parseOutbound({ ...reply, operatorName: "Bot", operatorEmail: null }, NOW)?.human).toBe(false);
    expect(parseOutbound({ ...reply, operatorName: "WATI Chatbot" }, NOW)?.human).toBe(false);
    expect(parseOutbound({ ...reply, operatorName: "Robert" }, NOW)?.human).toBe(true);
  });

  it("flags a reply with no operator", () => {
    const r = parseOutbound({ ...reply, operatorName: null, operatorEmail: "" }, NOW);
    expect(r?.by).toBeNull();
    expect(r?.operatorUnknown).toBe(true);
    expect(r?.human).toBe(true);
  });
});

describe("countsAsReply", () => {
  const first = new Date("2026-10-30T10:00:00Z");
  const at = (s: number) => new Date(first.getTime() + s * 1000);
  const out = { phone: "60123456789", by: "Ain", human: true, operatorUnknown: false };

  it("counts a named human reply after the first message", () => {
    expect(countsAsReply({ ...out, at: at(5) }, first)).toBe(true);
  });
  it("never counts a message before the lead wrote", () => {
    expect(countsAsReply({ ...out, at: at(-60) }, first)).toBe(false);
  });
  it("never counts automations", () => {
    expect(countsAsReply({ ...out, human: false, at: at(600) }, first)).toBe(false);
  });
  it("with no operator, only counts slow replies", () => {
    const anon = { ...out, by: null, operatorUnknown: true };
    expect(countsAsReply({ ...anon, at: at(2) }, first)).toBe(false);
    expect(countsAsReply({ ...anon, at: at(45) }, first)).toBe(true);
  });
});

describe("keysOf", () => {
  it("lists field names only", () => {
    expect(keysOf({ waId: "601", text: "secret" })).toEqual(["waId", "text"]);
    expect(keysOf([1, 2])).toBeNull();
    expect(keysOf("x")).toBeNull();
  });
});
