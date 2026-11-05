import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reportLinks, tiktokAccounts } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/**
 * Create, replace or remove a handle's Google Sheet report link. Admin auth.
 * Body: { accountId, action: "create" | "rotate" | "remove" }. "rotate" gives a
 * new key, so the old link (and any Sheet using it) stops working at once.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { accountId?: unknown; action?: unknown } | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  const action = body?.action;
  if (!accountId || (action !== "create" && action !== "rotate" && action !== "remove")) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const account = await db.query.tiktokAccounts.findFirst({
    where: eq(tiktokAccounts.id, accountId),
    columns: { id: true, handle: true },
  });
  if (!account) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  if (action === "remove") {
    await db.delete(reportLinks).where(eq(reportLinks.accountId, accountId));
  } else {
    const key = randomBytes(32).toString("base64url");
    await db
      .insert(reportLinks)
      .values({ accountId, key })
      .onConflictDoUpdate({
        target: reportLinks.accountId,
        set: { key, lastFetchedAt: null, updatedAt: new Date() },
      });
  }

  // The key itself is never written to the audit log.
  await writeAudit({
    actorUserId: auth.userId,
    eventType: `report_link.${action}`,
    entityType: "tiktok_account",
    entityId: accountId,
    after: { handle: account.handle },
  });
  return NextResponse.json({ ok: true });
}
