import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/**
 * Set or CHANGE the owning Gmail of a Google ad account.
 *
 * The common fix this powers: an account is filed under the wrong Gmail (Google
 * returns 403 "caller does not have permission"), so it never pulls data. The
 * operator re-points it to the Gmail that can actually open it in Google Ads.
 *
 * Token handling:
 *  - If the account is already pulling data (has a token AND has synced) → just
 *    relabel; never disturb a working token.
 *  - Otherwise (no token, or never synced = likely the wrong Gmail) → take the
 *    NEW Gmail's token: copy it from one of that Gmail's already-authorized
 *    accounts (instant connect, no sign-in), or clear it so the account shows up
 *    needing that Gmail's one-time sign-in. Admin auth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = (body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid Gmail address." },
      { status: 400 }
    );
  }

  const acct = await db.query.adAccounts.findFirst({
    where: eq(adAccounts.id, id),
    columns: {
      id: true,
      platform: true,
      accessTokenEncrypted: true,
      lastSyncedAt: true,
    },
  });
  if (!acct || acct.platform !== "google") {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  const working = !!acct.accessTokenEncrypted && !!acct.lastSyncedAt;
  let tokenToSet = acct.accessTokenEncrypted;
  let copiedToken = false;
  let needsSignIn = false;
  if (!working) {
    const sibling = await db.query.adAccounts.findFirst({
      where: and(
        eq(adAccounts.platform, "google"),
        ne(adAccounts.id, id),
        isNotNull(adAccounts.accessTokenEncrypted),
        sql`lower(${adAccounts.owningEmail}) = ${email}`
      ),
      columns: { accessTokenEncrypted: true },
    });
    if (sibling?.accessTokenEncrypted) {
      tokenToSet = sibling.accessTokenEncrypted;
      copiedToken = true;
    } else {
      tokenToSet = null; // new Gmail isn't authorized yet → needs one sign-in
      needsSignIn = true;
    }
  }

  await db
    .update(adAccounts)
    .set({ owningEmail: email, accessTokenEncrypted: tokenToSet, updatedAt: new Date() })
    .where(eq(adAccounts.id, id));

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "ad_account.owning_email_set",
    entityType: "ad_account",
    entityId: id,
    after: { email, copiedToken, needsSignIn },
  });

  return NextResponse.json({ ok: true, copiedToken, needsSignIn });
}
