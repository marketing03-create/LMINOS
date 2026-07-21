/**
 * Runs once at server startup (Next.js instrumentation hook). LMIROS is a
 * Malaysian business, so the whole app runs on Malaysia time (MYT, UTC+8):
 * every server-rendered date/time displays in MYT and day boundaries for
 * ranges are Malaysia-local. Vercel reserves the TZ env var, so we set it here
 * instead (verified: assigning process.env.TZ at runtime re-sets Node's clock).
 * Stored timestamps stay absolute (timestamptz) — only display/derivation shifts.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = "Asia/Kuala_Lumpur";
  }
}
