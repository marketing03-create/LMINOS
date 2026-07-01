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
  | "viewer";

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
 * Require the current user to hold one of `roles`. Returns the resolved
 * userId + role on success, or a 401/403 result to return from the route.
 */
export async function requireRole(roles: Role[]): Promise<AuthResult> {
  if (devBypass()) {
    return { ok: true, userId: null, role: "hq_admin" };
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
