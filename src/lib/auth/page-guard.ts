/**
 * Role checks for PAGES — call one at the top of every page that renders data.
 *
 * Why the dashboard layout's check is not enough: Next.js keeps a layout on
 * screen across navigations and does not re-run it. A client that claims (in
 * the router-state header) to already have the dashboard layout gets only the
 * page segment rendered — the layout, and its role check, never run. Verified
 * on 2026-10-29: signed in as a live_streamer, one crafted request to
 * /admin/audit returned the full audit log with every staff email. Next's own
 * docs say the same ("be cautious when doing checks in Layouts").
 *
 * So the layout's check stays (it handles the normal case and the redirect UX),
 * and each page re-checks for itself. `redirect()` works from a partially
 * rendered page too, so the crafted request gets a redirect, not the data.
 */
import { redirect } from "next/navigation";
import {
  ADMIN_ROLES,
  getAccountStatus,
  getSessionUser,
  type Role,
  type SessionUser,
} from "./authorize";
import { homeForRole } from "./access";

/** The signed-in user if their role is in `allowed`; otherwise a redirect. */
export async function requirePageRole(allowed: readonly Role[]): Promise<SessionUser> {
  const me = await getSessionUser();
  if (!me) {
    const status = await getAccountStatus();
    redirect(status === "inactive" ? "/login?error=account_disabled" : "/login");
  }
  if (!allowed.includes(me.role)) redirect(homeForRole(me.role));
  return me;
}

/** Admin pages: hq_admin and marketing_manager only. */
export function requireAdminPage(): Promise<SessionUser> {
  return requirePageRole(ADMIN_ROLES);
}

/**
 * /tiktok-live pages: a streamer (who is then scoped to their own handles by
 * the page) or an admin. Every other role is turned away here — these pages
 * treat "not a streamer" as "sees every handle", so letting a viewer through
 * would hand them everyone's lives.
 */
export function requireLivePage(): Promise<SessionUser> {
  return requirePageRole(["live_streamer", ...ADMIN_ROLES]);
}
