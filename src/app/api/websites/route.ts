import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brands, websites } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/** lowercase, alnum + underscore — matches the Zoho "Website" slug style. */
function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Create a website. Admin auth. */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    slug?: string;
    whatsappNumber?: string;
  } | null;
  const name = (body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "Website name is required." }, { status: 400 });
  }
  const slug = (body?.slug ? slugify(body.slug) : slugify(name)) || slugify(name);
  if (!slug) {
    return NextResponse.json({ ok: false, error: "Could not derive a slug." }, { status: 400 });
  }
  const whatsappNumber = (body?.whatsappNumber ?? "").trim() || null;

  const def = await db.query.brands.findFirst({
    where: eq(brands.slug, "default"),
    columns: { id: true },
  });

  const [row] = await db
    .insert(websites)
    .values({ slug, name, whatsappNumber, brandId: def?.id ?? null })
    .onConflictDoNothing({ target: websites.slug })
    .returning({ id: websites.id });

  if (!row) {
    return NextResponse.json(
      { ok: false, error: `A website with slug "${slug}" already exists.` },
      { status: 409 }
    );
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "website.created",
    entityType: "website",
    entityId: row.id,
    after: { slug, name },
  });

  return NextResponse.json({ ok: true, id: row.id, slug });
}
