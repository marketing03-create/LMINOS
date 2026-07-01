import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { encryptToken } from "@/lib/crypto/envelope";
import { consentUrl, exchangeAuthCodeForRefreshToken } from "@/lib/google-ads/auth";

/**
 * Authorize ONE Gmail and apply its refresh token to ALL Google ad accounts it
 * owns (owning_email) — so 4 sign-ins cover ~90 accounts. Two calls:
 *   1. { email }        → returns the consent URL (login_hint = email).
 *   2. { email, code }  → exchanges the code, encrypts + stores the token on
 *                          every account with that owning_email.
 * Admin auth.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    code?: string;
  } | null;
  const email = (body?.email ?? "").trim().toLowerCase();
  const code = (body?.code ?? "").trim();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Gmail is required." }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Google Ads OAuth client not configured." },
      { status: 500 }
    );
  }

  // Step 1 — hand back the sign-in URL, pre-selecting this Gmail.
  if (!code) {
    return NextResponse.json({
      ok: true,
      consentUrl: consentUrl({ clientId, loginHint: email }),
    });
  }

  // Step 2 — exchange + apply the token to every account this Gmail owns.
  try {
    const { refreshToken } = await exchangeAuthCodeForRefreshToken({
      code,
      clientId,
      clientSecret,
    });
    const enc = encryptToken(refreshToken);
    const updated = await db
      .update(adAccounts)
      .set({ accessTokenEncrypted: enc })
      .where(
        and(
          eq(adAccounts.platform, "google"),
          sql`lower(${adAccounts.owningEmail}) = ${email}`
        )
      )
      .returning({ id: adAccounts.id });

    await writeAudit({
      actorUserId: auth.userId,
      eventType: "ad_account.gmail_authorized",
      entityType: "ad_account",
      entityId: email,
      after: { email, accountsAuthorized: updated.length },
    });

    return NextResponse.json({ ok: true, applied: updated.length });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error:
        (err instanceof Error ? err.message : String(err)) +
        " — the code may have expired (get a fresh one), or the sign-in wasn't for " +
        email,
    });
  }
}
