/**
 * Malaysia phone normalization.
 *
 * We hand-rolled this rather than using libphonenumber-js because that
 * library's bundled-metadata loading breaks under tsx's CJS bundling at
 * worker runtime (`hasOwnProperty` on undefined metadata). For Phase 1 we
 * only accept MY mobile numbers, so the rules are simple enough to encode
 * directly.
 *
 * Output: E.164 without the leading '+', e.g. '60123456789'.
 *
 * Examples:
 *   '0123456789'      → '60123456789'
 *   '+60123456789'    → '60123456789'
 *   '012-345 6789'    → '60123456789'
 *   '011-12345678'    → '601112345678'
 *   ''                → { ok: false }
 *   'abc'             → { ok: false }
 *   '+1 555 555 5555' → { ok: false }
 *   '0000000000'      → { ok: false }
 */

export type PhoneResult =
  | { ok: true; normalized: string; raw: string }
  | { ok: false; reason: string; raw: string };

// Malaysian mobile in international form:
//   60 + 1 + (any digit 0-9) + 7 or 8 more digits
// → total 11 or 12 digits.
// We accept any '1X' second-prefix (010..019) because the MCMC allocates
// new ones over time; we'd rather over-accept than reject a real lead.
const MY_MOBILE = /^601\d{8,9}$/;

export function normalizePhoneMY(input: unknown): PhoneResult {
  const raw = typeof input === "string" ? input : "";
  if (!raw.trim()) {
    return { ok: false, reason: "empty", raw };
  }

  // Strip everything except digits (drops '+', spaces, dashes, parens, etc.).
  let digits = raw.replace(/\D/g, "");
  if (!digits) {
    return { ok: false, reason: "no_digits", raw };
  }

  // Promote local form (leading 0) to international.
  if (digits.startsWith("60")) {
    // already international
  } else if (digits.startsWith("0")) {
    digits = "60" + digits.slice(1);
  } else {
    // Numbers like "+1 555-555-5555" → "15555555555". Reject anything that
    // doesn't look like it could be a MY number.
    return { ok: false, reason: "non_my_country", raw };
  }

  if (!MY_MOBILE.test(digits)) {
    return { ok: false, reason: "invalid_mobile_format", raw };
  }

  return { ok: true, normalized: digits, raw };
}
