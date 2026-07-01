/**
 * Lead-keyword matching for TikTok live comments. A viewer who comments one of
 * the configured keywords (e.g. "LEND") is counted as a lead. Pure + tested.
 */
export const DEFAULT_KEYWORDS = ["lend", "loan", "pinjaman", "apply"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns the FIRST keyword that appears in `text` as a whole word
 * (case-insensitive), or null. Word-boundary so "blending" does NOT match
 * "lend" and "lend!" / "i want lend" DO.
 */
export function matchKeyword(
  text: string,
  keywords: string[] = DEFAULT_KEYWORDS
): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const raw of keywords) {
    const k = raw.trim().toLowerCase();
    if (!k) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(k)}([^a-z0-9]|$)`, "i");
    if (re.test(lower)) return raw.trim();
  }
  return null;
}
