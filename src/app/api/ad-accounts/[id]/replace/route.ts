import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/**
 * Link a replacement: mark THIS account (`id`) as replaced by another account,
 * and make the replacement inherit this account's website. The replacement is
 * normally created first via the Add-account flow (with the same website), then
 * linked here. Admin auth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    replacementAccountId?: string;
  } | null;
  const replacementAccountId = (body?.replacementAccountId ?? "").trim();
  if (!replacementAccountId) {
    return NextResponse.json(
      { ok: false, error: "replacementAccountId is required." },
      { status: 400 }
    );
  }
  if (replacementAccountId === id) {
    return NextResponse.json(
      { ok: false, error: "An account cannot replace itself." },
      { status: 400 }
    );
  }

  const oldAcct = await db.query.adAccounts.findFirst({
    where: eq(adAccounts.id, id),
    columns: { id: true, websiteId: true, website: true, externalAccountId: true },
  });
  const newAcct = await db.query.adAccounts.findFirst({
    where: eq(adAccounts.id, replacementAccountId),
    columns: { id: true, externalAccountId: true },
  });
  if (!oldAcct || !newAcct) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  // Old account → replaced + suspended; new account inherits the website.
  await db
    .update(adAccounts)
    .set({
      status: "replaced",
      isActive: false,
      suspendedAt: new Date(),
      replacedByAccountId: newAcct.id,
    })
    .where(eq(adAccounts.id, oldAcct.id));

  await db
    .update(adAccounts)
    .set({ websiteId: oldAcct.websiteId, website: oldAcct.website, isActive: true, status: "active" })
    .where(eq(adAccounts.id, newAcct.id));

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "ad_account.replaced",
    entityType: "ad_account",
    entityId: oldAcct.id,
    after: {
      replacedBy: newAcct.externalAccountId,
      website: oldAcct.website,
    },
  });

  return NextResponse.json({ ok: true });
}
