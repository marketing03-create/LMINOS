import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, brands, websites } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

async function resolveWebsite(
  websiteId: string | undefined,
  websiteSlug: string | null,
  displayName: string
): Promise<{ id: string | null; slug: string | null } | undefined> {
  if (websiteId) {
    const w = await db.query.websites.findFirst({
      where: eq(websites.id, websiteId),
      columns: { id: true, slug: true },
    });
    if (w) return { id: w.id, slug: w.slug };
  }
  if (websiteSlug != null) {
    const s = slugify(websiteSlug);
    if (!s) return { id: null, slug: null };
    const existing = await db.query.websites.findFirst({
      where: eq(websites.slug, s),
      columns: { id: true, slug: true },
    });
    if (existing) return existing;
    const def = await db.query.brands.findFirst({
      where: eq(brands.slug, "default"),
      columns: { id: true },
    });
    const [row] = await db
      .insert(websites)
      .values({ slug: s, name: displayName || s, brandId: def?.id ?? null })
      .onConflictDoNothing({ target: websites.slug })
      .returning({ id: websites.id, slug: websites.slug });
    if (row) return row;
    const again = await db.query.websites.findFirst({
      where: eq(websites.slug, s),
      columns: { id: true, slug: true },
    });
    return { id: again?.id ?? null, slug: again?.slug ?? s };
  }
  return undefined;
}

/** Edit an ad account (name / website / owning Gmail / active). Admin auth. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    displayName?: string;
    owningEmail?: string | null;
    isActive?: boolean;
    website?: string | null;
    websiteId?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const set: Record<string, unknown> = {};
  if (typeof body.displayName === "string" && body.displayName.trim())
    set.displayName = body.displayName.trim();
  if ("owningEmail" in body)
    set.owningEmail = (body.owningEmail ?? "").toString().trim().toLowerCase() || null;
  if (typeof body.isActive === "boolean") set.isActive = body.isActive;

  if ("website" in body || "websiteId" in body) {
    const acct = await db.query.adAccounts.findFirst({
      where: eq(adAccounts.id, id),
      columns: { displayName: true },
    });
    const site = await resolveWebsite(
      body.websiteId,
      "website" in body ? (body.website ?? null) : null,
      (set.displayName as string) ?? acct?.displayName ?? ""
    );
    if (site) {
      set.website = site.slug;
      set.websiteId = site.id;
    }
  }

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
  }

  const [row] = await db
    .update(adAccounts)
    .set(set)
    .where(eq(adAccounts.id, id))
    .returning({ id: adAccounts.id });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "ad_account.updated",
    entityType: "ad_account",
    entityId: id,
    after: set,
  });
  return NextResponse.json({ ok: true });
}

/**
 * Delete an ad account + all its data (spend, campaigns, keywords, hourly —
 * cascade). Leads keep their rows (ad_account_id set null). Admin auth.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const [row] = await db
    .delete(adAccounts)
    .where(eq(adAccounts.id, id))
    .returning({ id: adAccounts.id, externalAccountId: adAccounts.externalAccountId });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "ad_account.deleted",
    entityType: "ad_account",
    entityId: id,
    after: { externalAccountId: row.externalAccountId },
  });
  return NextResponse.json({ ok: true });
}
