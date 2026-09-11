/**
 * Role-based authorization for API routes.
 *
 * Until now every logged-in user could call admin endpoints ("logged-in =
 * admin"). This gates sensitive routes to specific roles. Critically, the dev
 * auth-bypass is IGNORED in production, so a leaked `LMIROS_DEV_BYPASS_AUTH`
 * env can never open prod.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Role =
  | "hq_admin"
  | "marketing_manager"
  | "team_lead"
  | "sales_agent"
  | "viewer"
  | "live_streamer";

export type AuthOk = { ok: true; userId: string | null; role: Role };
export type AuthFail = { ok: false; status: 401 | 403; error: string };
export type AuthResult = AuthOk | AuthFail;

/** Dev bypass is only honoured OUTSIDE production. */
function devBypass(): boolean {
  return (
    process.env.LMIROS_DEV_BYPASS_AUTH === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

/**
 * Which role the dev bypass impersonates. Defaults to hq_admin; set
 * LMIROS_DEV_BYPASS_ROLE=live_streamer to preview the streamer experience
 * without a real login. Only ever consulted inside devBypass(), so it has no
 * effect in production.
 */
function devBypassRole(): Role {
  const r = process.env.LMIROS_DEV_BYPASS_ROLE;
  return r === "live_streamer" || r === "marketing_manager" || r === "viewer"
    ? r
    : "hq_admin";
}

/**
 * Require the current user to hold one of `roles`. Returns the resolved
 * userId + role on success, or a 401/403 result to return from the route.
 */
export async function requireRole(roles: Role[]): Promise<AuthResult> {
  if (devBypass()) {
    return { ok: true, userId: null, role: devBypassRole() };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthorized" };

  const row = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { role: true, isActive: true },
  });
  if (!row || !row.isActive) {
    return { ok: false, status: 403, error: "no active user record" };
  }
  if (!roles.includes(row.role as Role)) {
    return {
      ok: false,
      status: 403,
      error: `forbidden — requires role ${roles.join(" or ")}`,
    };
  }
  return { ok: true, userId: user.id, role: row.role as Role };
}

/** Roles allowed to manage config + spend money (the common admin gate). */
export const ADMIN_ROLES: Role[] = ["hq_admin", "marketing_manager"];

export type SessionUser = {
  userId: string | null;
  email: string | null;
  role: Role;
};

/**
 * Resolve the current user's id + email + role WITHOUT a network round trip to
 * the auth server: getClaims verifies the session JWT locally (like the layout
 * + proxy), then one indexed lookup gets the role. Returns null when there's no
 * active session. Used by the dashboard layout + pages to render role-aware UI
 * and gate the live-streamer experience. Mutating APIs keep requireRole().
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (devBypass()) {
    return { userId: null, email: "dev@stub.local", role: devBypassRole() };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const userId = typeof claims.sub === "string" ? claims.sub : null;
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!userId) return null;

  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true, isActive: true },
  });
  if (!row || !row.isActive) return null;

  return { userId, email, role: row.role as Role };
}

/**
 * WHY a page has no user. `getSessionUser()` answers null for two different
 * situations — nobody is signed in, and someone IS signed in but has no active
 * account — and the dashboard layout used to send both to /login. For the
 * second that was a silent loop: sign-in succeeds, the page bounces straight
 * back to the sign-in form, and nothing on screen says why. A streamer spent a
 * morning in that loop on 11 Sept after her account was switched off.
 *
 * Only called on the already-rare null path, so a normal page load pays nothing
 * for it. A signed-in user with no app row at all is reported as "inactive" too:
 * from her side the problem, and the fix (ask an admin), are the same.
 */
export async function getAccountStatus(): Promise<"signed-out" | "inactive" | "active"> {
  if (devBypass()) return "active";

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims && typeof claims.sub === "string" ? claims.sub : null;
  if (!userId) return "signed-out";

  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { isActive: true },
  });
  return row?.isActive ? "active" : "inactive";
}
