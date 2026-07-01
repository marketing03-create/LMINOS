import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { encryptToken } from "@/lib/crypto/envelope";
import { exchangeAuthCodeForRefreshToken } from "@/lib/google-ads/auth";
import { syncGoogleAdsMetrics } from "@/lib/google-ads/sync";

// Only syncing one account during connect — syncing all 86 would hit the
// Vercel function timeout (~10 min) and return a non-JSON error page.
export const maxDuration = 300;

/**
 * Exchange the OAuth auth code for this account, encrypt + store its refresh
 * token, then run a backfill sync for THIS account only. Admin auth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  const actorId = auth.userId;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = (body?.code ?? "").trim();
  if (!code) {
    return NextResponse.json({ ok: false, error: "Missing sign-in code." }, { status: 400 });
  }

  const acct = await db.query.adAccounts.findFirst({
    where: eq(adAccounts.id, id),
    columns: { id: true, displayName: true, externalAccountId: true, platform: true },
  });
  if (!acct || acct.platform !== "google") {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Google Ads OAuth client not configured." },
      { status: 500 }
    );
  }

  try {
    const { refreshToken } = await exchangeAuthCodeForRefreshToken({
      code,
      clientId,
      clientSecret,
    });
    await db
      .update(adAccounts)
      .set({ accessTokenEncrypted: encryptToken(refreshToken) })
      .where(eq(adAccounts.id, acct.id));

    // Backfill 90 days for THIS account only. Syncing all accounts here would
    // hit the Vercel function timeout (~10 min for 86 accounts → non-JSON error).
    const synced = await syncGoogleAdsMetrics({ days: 90, accountId: acct.id });
    const thisAccountErrors = synced.errors.filter(
      (e) => e.account === acct.externalAccountId
    );

    await writeAudit({
      actorUserId: actorId,
      eventType: "ad_account.connected",
      entityType: "ad_account",
      entityId: acct.id,
      after: { externalAccountId: acct.externalAccountId, rowsUpserted: synced.rowsUpserted },
    });

    if (thisAccountErrors.length > 0) {
      return NextResponse.json({
        ok: false,
        error: `Connected, but the sync could not read this account: ${thisAccountErrors[0].error}. Make sure the Google account you signed in with has access to ${acct.externalAccountId}.`,
      });
    }

    return NextResponse.json({
      ok: true,
      accountId: acct.id,
      displayName: acct.displayName,
      rowsUpserted: synced.rowsUpserted,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error:
        (err instanceof Error ? err.message : String(err)) +
        " — the code may have expired (get a fresh one) or the sign-in didn't grant offline access.",
    });
  }
}
