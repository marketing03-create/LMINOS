/**
 * Central page-access policy (Feature U hardening).
 *
 * LMIROS was originally "logged-in = can see everything" — every authenticated
 * user could browse Leads / ROAS / Ad spend / admin pages (they just couldn't
 * change anything). For a licensed lender that's a data leak. This flips it to
 * DEFAULT-DENY: a role sees only the sections explicitly allowed here, enforced
 * centrally in the dashboard layout (server-side redirect, not just hidden nav).
 *
 * Pure module (type-only import of Role) so it is safe to reason about and can
 * be imported anywhere without pulling in db/supabase.
 */
import type { Role } from "./authorize";

export type Access = {
  /** "all" = every page; otherwise the allow-listed path prefixes. */
  allowed: "all" | string[];
  /** Where this role lands / is bounced to. Must itself be allowed. */
  home: string;
};

/** The neutral landing for a role with no data access yet. */
export const NO_ACCESS_PATH = "/no-access";

export function accessForRole(role: Role): Access {
  switch (role) {
    // Admins run the company — full access.
    case "hq_admin":
    case "marketing_manager":
      return { allowed: "all", home: "/dashboard" };
    // A live streamer only ever sees + uploads their own TikTok Live.
    case "live_streamer":
      return { allowed: [NO_ACCESS_PATH, "/tiktok-live"], home: "/tiktok-live" };
    // team_lead / sales_agent / viewer / anything else: NO company data by
    // default. They land on a neutral page until an admin grants a real role.
    default:
      return { allowed: [NO_ACCESS_PATH], home: NO_ACCESS_PATH };
  }
}

/** True if `role` may view `pathname`. */
export function canAccessPath(role: Role, pathname: string): boolean {
  const a = accessForRole(role);
  if (a.allowed === "all") return true;
  return a.allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** The landing page for a role (used for the logo link + redirect target). */
export function homeForRole(role: Role): string {
  return accessForRole(role).home;
}

/** Whether a role should see the full admin/operations sidebar. */
export function isAdminRole(role: Role): boolean {
  return role === "hq_admin" || role === "marketing_manager";
}
