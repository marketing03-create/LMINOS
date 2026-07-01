const RFC5322 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailResult =
  | { ok: true; normalized: string; raw: string }
  | { ok: false; raw: string };

export function normalizeEmail(input: unknown): EmailResult {
  const raw = typeof input === "string" ? input : "";
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !RFC5322.test(trimmed)) {
    return { ok: false, raw };
  }
  return { ok: true, normalized: trimmed, raw };
}
