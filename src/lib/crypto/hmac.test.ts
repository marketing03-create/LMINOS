import { describe, expect, it } from "vitest";
import { signHmacSha256Hex, verifyHmacSha256Hex } from "./hmac";

describe("HMAC SHA256", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ phone: "+60123456789", loan_type: "personal" });

  it("signs and verifies a known body", () => {
    const sig = signHmacSha256Hex(secret, body);
    expect(verifyHmacSha256Hex(secret, body, sig)).toBe(true);
    expect(verifyHmacSha256Hex(secret, body, `sha256=${sig}`)).toBe(true);
  });

  it("rejects an empty signature", () => {
    expect(verifyHmacSha256Hex(secret, body, "")).toBe(false);
    expect(verifyHmacSha256Hex(secret, body, null)).toBe(false);
    expect(verifyHmacSha256Hex(secret, body, undefined)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const sig = signHmacSha256Hex(secret, body);
    expect(verifyHmacSha256Hex(secret, body + "x", sig)).toBe(false);
  });

  it("rejects a tampered secret", () => {
    const sig = signHmacSha256Hex(secret, body);
    expect(verifyHmacSha256Hex("other-secret", body, sig)).toBe(false);
  });

  it("rejects non-hex input", () => {
    expect(verifyHmacSha256Hex(secret, body, "not-hex!")).toBe(false);
  });

  it("rejects wrong-length hex (early exit, no crash)", () => {
    expect(verifyHmacSha256Hex(secret, body, "abcd")).toBe(false);
  });
});
