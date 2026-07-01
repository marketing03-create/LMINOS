import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, brands, websites } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { consentUrl } from "@/lib/google-ads/auth";
import { normalizeCustomerId } from "@/lib/google-ads/client";

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Resolve the website hub for a new account. Accepts an existing website id, or
 * a slug to find-or-create. Returns the website's {id, slug} (or null/null).
 */
async function resolveWebsite(
  websiteId: string | undefined,
  websiteSlug: string | null,
  displayName: string,
  brandId: string
): Promise<{ id: string | null; slug: string | null }> {
  if (websiteId) {
    const w = await db.query.websites.findFirst({
      where: eq(websites.id, websiteId),
      columns: { id: true, slug: true },
    });
    if (w) return { id: w.id, slug: w.slug };
  }
  if (websiteSlug) {
    const slug = slugify(websiteSlug);
    if (!slug) return { id: null, slug: null };
    const existing = await db.query.websites.findFirst({
      where: eq(websites.slug, slug),
      columns: { id: true, slug: true },
    });
    if (existing) return { id: existing.id, slug: existing.slug };
    const [row] = await db
      .insert(websites)
      .values({ slug, name: displayName || slug, brandId })
      .onConflictDoNothing({ target: websites.slug })
      .returning({ id: websites.id, slug: websites.slug });
    if (row) return { id: row.id, slug: row.slug };
    // race: someone created it — read back
    const w = await db.query.websites.findFirst({
      where: eq(websites.slug, slug),
      columns: { id: true, slug: true },
    });
    return { id: w?.id ?? null, slug: w?.slug ?? slug };
  }
  return { id: null, slug: null };
}

/**
 * Register (or update) a Google Ads ad account, then return the OAuth consent
 * URL so the operator can sign in as the account's owning Gmail. Admin auth.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  const actorId = auth.userId;

  const body = (await request.json().catch(() => null)) as {
    customerId?: string;
    displayName?: string;
    website?: string;
    websiteId?: string;
    brandSlug?: string;
    owningEmail?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const customerId = normalizeCustomerId(body.customerId ?? "");
  const displayName = (body.displayName ?? "").trim();
  const websiteSlugInput = (body.website ?? "").trim() || null;
  const websiteIdInput = (body.websiteId ?? "").trim() || undefined;
  const brandSlug = (body.brandSlug ?? "default").trim() || "default";
  const owningEmail = (body.owningEmail ?? "").trim() || undefined;

  if (customerId.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Customer ID must be the 10-digit Google Ads account number." },
      { status: 400 }
    );
  }
  if (!displayName) {
    return NextResponse.json(
      { ok: false, error: "Account name is required." },
      { status: 400 }
    );
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "Google Ads OAuth client is not configured (GOOGLE_ADS_CLIENT_ID)." },
      { status: 500 }
    );
  }

  const brand = await db.query.brands.findFirst({
    where: eq(brands.slug, brandSlug),
    columns: { id: true },
  });
  if (!brand) {
    return NextResponse.json(
      { ok: false, error: `Brand "${brandSlug}" not found.` },
      { status: 400 }
    );
  }

  // Resolve (or create) the website hub and link both the slug + relational id.
  const site = await resolveWebsite(
    websiteIdInput,
    websiteSlugInput,
    displayName,
    brand.id
  );
  const website = site.slug;

  // Upsert by (platform, externalAccountId) — same key the seed script uses.
  const existing = await db.query.adAccounts.findFirst({
    where: and(
      eq(adAccounts.platform, "google"),
      eq(adAccounts.externalAccountId, customerId)
    ),
    columns: { id: true },
  });

  let accountId: string;
  if (existing) {
    await db
      .update(adAccounts)
      .set({ website, websiteId: site.id, displayName, brandId: brand.id, isActive: true })
      .where(eq(adAccounts.id, existing.id));
    accountId = existing.id;
  } else {
    const [row] = await db
      .insert(adAccounts)
      .values({
        platform: "google",
        externalAccountId: customerId,
        displayName,
        website,
        websiteId: site.id,
        brandId: brand.id,
        isActive: true,
      })
      .returning({ id: adAccounts.id });
    accountId = row.id;
  }

  await writeAudit({
    actorUserId: actorId,
    eventType: existing ? "ad_account.updated" : "ad_account.created",
    entityType: "ad_account",
    entityId: accountId,
    after: { platform: "google", externalAccountId: customerId, displayName, website },
  });

  return NextResponse.json({
    ok: true,
    accountId,
    existed: !!existing,
    consentUrl: consentUrl({ clientId, loginHint: owningEmail }),
  });
}
