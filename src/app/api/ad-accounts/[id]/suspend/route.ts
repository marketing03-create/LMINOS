import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/**
 * Mark an ad account suspended (Google suspended it) or reactivate it. History
 * stays; per-website ROAS aggregates by slug so it's continuous across the swap.
 * Admin auth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { suspend?: boolean } | null;
  const suspend = body?.suspend !== false; // default: suspend

  const set = suspend
    ? { status: "suspended" as const, suspendedAt: new Date(), isActive: false }
    : { status: "active" as const, suspendedAt: null, isActive: true };

  const [row] = await db
    .update(adAccounts)
    .set(set)
    .where(eq(adAccounts.id, id))
    .returning({ id: adAccounts.id, externalAccountId: adAccounts.externalAccountId });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: suspend ? "ad_account.suspended" : "ad_account.reactivated",
    entityType: "ad_account",
    entityId: id,
    after: { externalAccountId: row.externalAccountId, status: set.status },
  });

  return NextResponse.json({ ok: true, status: set.status });
}
