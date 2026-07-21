/**
 * The loan products/services a streamer can tag a LIVE session with, so HQ can
 * see which product(s) each live promoted (and later break performance down by
 * product). A live can promote several at once, so sessions store an array
 * (tiktok_live_sessions.products).
 *
 * Kept as an app-level list (not a Postgres enum) so the business can add or
 * rename a product without a schema migration — validation happens here.
 */
export const TIKTOK_PRODUCTS = [
  "Bank/Personal Loan",
  "KK",
  "Koperasi",
  "Cash Out Property",
  "Direct Lending",
] as const;

export type TikTokProduct = (typeof TIKTOK_PRODUCTS)[number];

const PRODUCT_SET = new Set<string>(TIKTOK_PRODUCTS);

/** True if `v` is one of the allowed product labels. */
export function isTikTokProduct(v: unknown): v is TikTokProduct {
  return typeof v === "string" && PRODUCT_SET.has(v);
}

/**
 * Sanitize an incoming products value into a clean list: keep only valid
 * labels, de-dupe, and return them in the canonical TIKTOK_PRODUCTS order.
 * Anything not an array (or an empty result) yields [].
 */
export function filterTikTokProducts(v: unknown): TikTokProduct[] {
  if (!Array.isArray(v)) return [];
  const set = new Set(v.filter(isTikTokProduct));
  return TIKTOK_PRODUCTS.filter((p) => set.has(p));
}
