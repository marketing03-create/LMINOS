import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { removedUsers, users } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ROLES = [
  "hq_admin",
  "marketing_manager",
  "team_lead",
  "sales_agent",
  "viewer",
  "live_streamer",
] as const;
type Role = (typeof ROLES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add a new LMIROS user ahead of their first sign-in. Admin auth.
 *
 * Login keys on the Supabase auth UID and `users.email` is UNIQUE, so we can't
 * just insert an app row — the signup trigger would later hit the unique-email
 * constraint and lock the person out of Google SSO. Instead we create the
 * Supabase auth identity via the admin API (NO email is sent, NO password —
 * Google SSO only; `email_confirm` marks it verified so their first Google
 * sign-in with the same address LINKS to this identity), then upsert the app row
 * with the chosen role. Result: the person signs in with Google and already has
 * the right role/team.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    fullName?: string | null;
    role?: string;
    teamId?: string | null;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email." },
      { status: 400 }
    );
  }
  const role: Role = ROLES.includes(body.role as Role)
    ? (body.role as Role)
    : "viewer";
  const fullName =
    typeof body.fullName === "string" && body.fullName.trim() !== ""
      ? body.fullName.trim().slice(0, 120)
      : null;
  const teamId = body.teamId ? body.teamId : null;

  // Already a user? (email is unique)
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "That email is already a user." },
      { status: 409 }
    );
  }

  // Create the Supabase auth identity (no email sent, no password → Google SSO).
  const admin = createSupabaseAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  });
  if (created.error || !created.data.user) {
    return NextResponse.json(
      {
        ok: false,
        error:
          created.error?.message ??
          "Could not create the login for that email.",
      },
      { status: 400 }
    );
  }
  const uid = created.data.user.id;

  // Upsert the app row with the chosen role (overrides the signup trigger's
  // default 'viewer' if it already fired for this id).
  await db
    .insert(users)
    .values({ id: uid, email, fullName, role, teamId, isActive: true })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, fullName, role, teamId, isActive: true },
    });

  // Re-adding an email that was previously removed is an explicit re-invite —
  // clear its tombstone so it isn't suppressed by the auto-provisioners.
  await db.delete(removedUsers).where(eq(removedUsers.email, email));

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "user.created",
    entityType: "user",
    entityId: uid,
    after: { email, role, teamId, fullName },
  });

  return NextResponse.json({ ok: true, id: uid });
}
