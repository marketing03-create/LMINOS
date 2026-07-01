import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Envelope encryption for ad-account access tokens.
 *
 * Storage format (base64): version(1) | iv(12) | authTag(16) | ciphertext
 *
 * Key comes from env ENCRYPTION_KEY — a 32-byte (256-bit) base64 string.
 * Rotate quarterly; old ciphertexts include version byte to support migration.
 */

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${key.length})`
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]).toString(
    "base64"
  );
}

export function decryptToken(envelope: string): string {
  const buf = Buffer.from(envelope, "base64");
  if (buf.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error("envelope too short");
  }
  const version = buf[0];
  if (version !== VERSION) {
    throw new Error(`unsupported envelope version ${version}`);
  }
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(1 + IV_LEN + TAG_LEN);

  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
