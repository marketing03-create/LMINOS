import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Compute an HMAC-SHA256 of `body` with `secret` and return the lowercase hex digest.
 * Used by website ingest webhooks. Callers pass the raw request body string.
 */
export function signHmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Timing-safe comparison of an incoming signature header against the expected HMAC.
 *
 * Header formats supported:
 *   "sha256=<hex>"
 *   "<hex>"
 */
export function verifyHmacSha256Hex(
  secret: string,
  body: string,
  providedSignature: string | null | undefined
): boolean {
  if (!providedSignature || !secret) return false;
  const provided = providedSignature.startsWith("sha256=")
    ? providedSignature.slice("sha256=".length)
    : providedSignature;

  if (!/^[0-9a-fA-F]+$/.test(provided)) return false;

  const expected = signHmacSha256Hex(secret, body);
  if (provided.length !== expected.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(provided, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}
