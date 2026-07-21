import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, brands } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { encryptToken } from "@/lib/crypto/envelope";
import {
  consentUrl,
  exchangeAuthCodeForRefreshToken,
  getAccessTokenForRefreshToken,
} from "@/lib/google-ads/auth";
import { normalizeCustomerId } from "@/lib/google-ads/client";

export const maxDuration = 120;

const API_VERSION = "v23";

type DiscoveredAccount = {
  customerId: string;
  name: string;
  isManager: boolean;
  status: string;
  alreadyInLmiros: boolean;
};

async function listAccessible(
  accessToken: string,
  devToken: string
): Promise<string[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": devToken,
      },
    }
  );
  const j = await res.json();
  if (!res.ok)
    throw new Error(
      `listAccessible HTTP ${res.status}: ${JSON.stringify(j).slice(0, 300)}`
    );
  return ((j.resourceNames as string[]) ?? []).map((r) => r.split("/")[1]);
}

async function enumerateClients(
  mccId: string,
  accessToken: string,
  devToken: string
): Promise<
  { id: string; name: string; isManager: boolean; status: string }[]
> {
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${mccId}/googleAds:searchStream`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": devToken,
      "login-customer-id": mccId,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: `SELECT customer_client.id, customer_client.descriptive_name,
                     customer_client.manager, customer_client.status, customer_client.level
              FROM customer_client`,
    }),
  });
  const text = await res.text();
  if (!res.ok) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  const out: { id: string; name: string; isManager: boolean; status: string }[] = [];
  for (const b of batches as { results?: { customerClient?: { id?: string; descriptiveName?: string; manager?: boolean; status?: string } }[] }[]) {
    for (const r of b.results ?? []) {
      const c = r.customerClient;
      if (!c?.id) continue;
      out.push({
        id: String(c.id),
        name: c.descriptiveName ?? String(c.id),
        isManager: !!c.manager,
        status: c.status ?? "UNKNOWN",
      });
    }
  }
  return out;
}

/**
 * Three-phase "Add Gmail" flow:
 *   1. { email }                        → consent URL
 *   2. { email, code }                  → exchange + discover all accounts → list
 *   3. { email, encryptedToken, import } → create selected accounts
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    code?: string;
    encryptedToken?: string;
    import?: { customerId: string; displayName: string }[];
  } | null;

  const email = (body?.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Gmail address is required." },
      { status: 400 }
    );
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Google Ads OAuth client not configured." },
      { status: 500 }
    );
  }
  if (!devToken) {
    return NextResponse.json(
      { ok: false, error: "Google Ads developer token not configured." },
      { status: 500 }
    );
  }

  // --- Phase 1: return consent URL ---
  if (!body?.code && !body?.encryptedToken) {
    return NextResponse.json({
      ok: true,
      phase: "consent",
      consentUrl: consentUrl({ clientId, loginHint: email }),
    });
  }

  // --- Phase 3: import selected accounts ---
  if (body?.encryptedToken && body?.import) {
    const selected = body.import;
    if (!selected.length) {
      return NextResponse.json(
        { ok: false, error: "No accounts selected." },
        { status: 400 }
      );
    }

    const brand = await db.query.brands.findFirst({
      where: eq(brands.slug, "default"),
      columns: { id: true },
    });
    if (!brand) {
      return NextResponse.json(
        { ok: false, error: 'Default brand not found.' },
        { status: 500 }
      );
    }

    const results: { customerId: string; displayName: string; action: string }[] = [];
    for (const acct of selected) {
      const cid = normalizeCustomerId(acct.customerId);
      if (cid.length < 8) {
        results.push({ customerId: cid, displayName: acct.displayName, action: "skipped (invalid ID)" });
        continue;
      }

      const existing = await db.query.adAccounts.findFirst({
        where: and(
          eq(adAccounts.platform, "google"),
          eq(adAccounts.externalAccountId, cid)
        ),
        columns: { id: true },
      });

      if (existing) {
        await db
          .update(adAccounts)
          .set({
            accessTokenEncrypted: body.encryptedToken,
            owningEmail: email,
            isActive: true,
          })
          .where(eq(adAccounts.id, existing.id));
        results.push({ customerId: cid, displayName: acct.displayName, action: "updated" });
      } else {
        await db.insert(adAccounts).values({
          platform: "google",
          externalAccountId: cid,
          displayName: acct.displayName,
          brandId: brand.id,
          owningEmail: email,
          accessTokenEncrypted: body.encryptedToken,
          isActive: true,
        });
        results.push({ customerId: cid, displayName: acct.displayName, action: "created" });
      }
    }

    await writeAudit({
      actorUserId: auth.userId,
      eventType: "ad_account.gmail_discovered_import",
      entityType: "ad_account",
      entityId: email,
      after: { email, imported: results.length, results },
    });

    return NextResponse.json({
      ok: true,
      phase: "imported",
      results,
    });
  }

  // --- Phase 2: exchange code + discover accounts ---
  if (body?.code) {
    try {
      const { refreshToken } = await exchangeAuthCodeForRefreshToken({
        code: body.code,
        clientId,
        clientSecret,
      });

      const accessToken = await getAccessTokenForRefreshToken(refreshToken);
      const encToken = encryptToken(refreshToken);

      const accessible = await listAccessible(accessToken, devToken);

      const seen = new Set<string>();
      const discovered: DiscoveredAccount[] = [];

      const existingAccounts = await db
        .select({
          externalAccountId: adAccounts.externalAccountId,
        })
        .from(adAccounts)
        .where(eq(adAccounts.platform, "google"));
      const existingSet = new Set(
        existingAccounts.map((a) => a.externalAccountId)
      );

      for (const mccId of accessible) {
        try {
          const clients = await enumerateClients(mccId, accessToken, devToken);
          for (const c of clients) {
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            discovered.push({
              customerId: c.id,
              name: c.name,
              isManager: c.isManager,
              status: c.status,
              alreadyInLmiros: existingSet.has(c.id),
            });
          }
        } catch {
          if (!seen.has(mccId)) {
            seen.add(mccId);
            discovered.push({
              customerId: mccId,
              name: `Account ${mccId}`,
              isManager: true,
              status: "UNKNOWN",
              alreadyInLmiros: existingSet.has(mccId),
            });
          }
        }
      }

      discovered.sort((a, b) => {
        if (a.isManager !== b.isManager) return a.isManager ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

      await writeAudit({
        actorUserId: auth.userId,
        eventType: "ad_account.gmail_discovered",
        entityType: "ad_account",
        entityId: email,
        after: { email, accountsFound: discovered.length },
      });

      return NextResponse.json({
        ok: true,
        phase: "discovered",
        encryptedToken: encToken,
        accounts: discovered,
      });
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

  return NextResponse.json(
    { ok: false, error: "Invalid request." },
    { status: 400 }
  );
}
