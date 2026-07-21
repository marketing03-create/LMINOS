import { pgEnum } from "drizzle-orm/pg-core";

/**
 * LMIROS is TikTok-Live-only. The lead / sale / ad-proposal / search-term enums
 * left with their features (migration 0030) — the Postgres types themselves are
 * dropped there too.
 *
 * `team_lead` and `sales_agent` are kept as VALUES because Postgres cannot
 * remove a value from an existing enum type without recreating it, and nothing
 * depends on them being gone. Neither is offered in the UI any more; both are
 * default-denied by `src/lib/auth/access.ts`.
 */
export const userRoleEnum = pgEnum("user_role", [
  "hq_admin",
  "marketing_manager",
  "team_lead",
  "sales_agent",
  "viewer",
  // A TikTok streamer: a restricted login that only sees + uploads results for
  // the TikTok handle(s) assigned to them.
  "live_streamer",
]);
