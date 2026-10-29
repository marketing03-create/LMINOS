import { describe, expect, it } from "vitest";
import { PAIR_TTL_SECONDS, makePairToken, verifyPairToken } from "./pairing";

const BOT = "123456:test-bot-token";
const OTHER_BOT = "999999:another-token";
const USER = "8193ac3c-2244-4ab1-97e8-b3518a1a9fa2";
const NOW = Date.UTC(2026, 9, 29, 8, 0, 0);

describe("Telegram pairing tokens", () => {
  it("round-trips to the same user and fits Telegram's /start limit", () => {
    const t = makePairToken(USER, BOT, NOW);
    expect(t.length).toBeLessThanOrEqual(64);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifyPairToken(t, BOT, NOW + 60_000)).toBe(USER);
  });

  it("expires after the TTL", () => {
    const t = makePairToken(USER, BOT, NOW);
    expect(verifyPairToken(t, BOT, NOW + (PAIR_TTL_SECONDS + 1) * 1000)).toBeNull();
  });

  it("rejects a token signed with a different bot key", () => {
    expect(verifyPairToken(makePairToken(USER, OTHER_BOT, NOW), BOT, NOW)).toBeNull();
  });

  it("rejects tampering: another user id, a later expiry, or a plain email", () => {
    const t = makePairToken(USER, BOT, NOW);
    const otherUser = "e752f8bc" + t.slice(8);
    expect(verifyPairToken(otherUser, BOT, NOW)).toBeNull();
    const [body, sig] = t.split("_");
    const laterExp = body.slice(0, 32) + (parseInt(body.slice(32), 36) + 86400).toString(36);
    expect(verifyPairToken(`${laterExp}_${sig}`, BOT, NOW)).toBeNull();
    expect(verifyPairToken("ceo@enquirymail.com", BOT, NOW)).toBeNull();
    expect(verifyPairToken("", BOT, NOW)).toBeNull();
  });
});
