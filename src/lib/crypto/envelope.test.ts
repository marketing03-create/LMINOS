import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptToken, encryptToken } from "./envelope";

describe("envelope encryption", () => {
  const prev = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });
  afterAll(() => {
    process.env.ENCRYPTION_KEY = prev;
  });

  it("round-trips arbitrary tokens", () => {
    const samples = [
      "EAAJZBxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "ya29.A0AfH6SMBxxxxxxxxxxxxxxxxxxx",
      "🔑 emoji and unicode ✓",
      "",
    ];
    for (const s of samples) {
      const enc = encryptToken(s);
      expect(enc).not.toBe(s);
      expect(decryptToken(enc)).toBe(s);
    }
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptToken("secret-token");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff; // flip last byte
    const tampered = buf.toString("base64");
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejects unsupported envelope version", () => {
    const enc = encryptToken("x");
    const buf = Buffer.from(enc, "base64");
    buf[0] = 99;
    expect(() => decryptToken(buf.toString("base64"))).toThrow(
      /version/
    );
  });
});
