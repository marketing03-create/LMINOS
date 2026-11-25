import { describe, expect, it } from "vitest";
import { isTikTok, parseTikTokMessage, shapeOf, shapeSignature } from "./tiktok-core";

const now = new Date("2026-11-25T10:00:00Z");

describe("isTikTok", () => {
  it("spots TikTok from a channel/source field or a TikTok-named field", () => {
    expect(isTikTok({ channelType: "TikTok" })).toBe(true);
    expect(isTikTok({ sourceType: "tiktok_dm" })).toBe(true);
    expect(isTikTok({ tikTokUserId: "7300112233" })).toBe(true);
  });
  it("leaves WhatsApp messages alone", () => {
    expect(isTikTok({ waId: "60123456789", channelPhoneNumber: "60164328160", type: "text" })).toBe(false);
    expect(isTikTok({ tikTokPhoneSource: 0 })).toBe(false);
  });
});

describe("parseTikTokMessage", () => {
  it("reads an incoming DM", () => {
    const m = parseTikTokMessage(
      { eventType: "message", channelType: "TikTok", channelId: "ch1", channelName: "@AdminAin111", tikTokUserId: "u42", senderName: "Siti", text: "nak pinjam", timestamp: "1795600000", conversationId: "c9" },
      now
    );
    expect(m).toMatchObject({ direction: "in", channelId: "ch1", channelLabel: "AdminAin111", senderId: "u42", name: "Siti", text: "nak pinjam", conversationId: "c9" });
  });
  it("reads a CS reply as outbound", () => {
    const m = parseTikTokMessage({ eventType: "sessionMessageSent", channelType: "tiktok", userId: "u42", operatorName: "Ain", text: "hi" }, now);
    expect(m).toMatchObject({ direction: "out", senderId: "u42", by: "Ain", channelId: "tiktok" });
  });
  it("is null for WhatsApp, other events, or no one to file it under", () => {
    expect(parseTikTokMessage({ eventType: "message", waId: "60123456789", text: "x" }, now)).toBeNull();
    expect(parseTikTokMessage({ eventType: "messageStatusUpdate", channelType: "tiktok", userId: "u" }, now)).toBeNull();
    expect(parseTikTokMessage({ eventType: "message", channelType: "tiktok" }, now)).toBeNull();
  });
  it("never dates a DM in the future", () => {
    expect(parseTikTokMessage({ channelType: "tiktok", userId: "u", timestamp: "2099-01-01T00:00:00Z" }, now)?.at).toEqual(now);
  });
});

describe("shapeOf", () => {
  it("keeps field names and types, never values", () => {
    const shape = shapeOf({ waId: "60123456789", text: "secret words", owner: false, n: 3, data: null, list: [] });
    expect(shape).toEqual({ waId: "phone-like", text: "string", owner: "boolean", n: "number", data: "null", list: "array" });
    expect(JSON.stringify(shape)).not.toContain("secret");
    expect(shapeSignature(shape)).toBe("data,list,n,owner,text,waId");
  });
});
