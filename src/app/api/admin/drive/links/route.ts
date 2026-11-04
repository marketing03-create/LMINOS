import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokDriveLinks } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { errorResponse } from "@/lib/drive/api";
import { savedDrive } from "@/lib/drive/client";
import { parseSharedDriveId } from "@/lib/drive/core";

/**
 * Link a TikTok handle to the Shared Drive its customers' folders go in — or
 * unlink it with `sharedDrive: null`. The service account must already be able
 * to add folders there; that is checked before saving. Admin auth.
 *
 * Body: { accountId, sharedDrive: "<id or link>" | null } → { ok, name }
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    accountId?: unknown;
    sharedDrive?: unknown;
  } | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  const account = /^[0-9a-f-]{36}$/i.test(accountId)
    ? await db.query.tiktokAccounts.findFirst({
        where: eq(tiktokAccounts.id, accountId),
        columns: { id: true, handle: true },
      })
    : null;
  if (!account) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const before = await db.query.tiktokDriveLinks.findFirst({ where: eq(tiktokDriveLinks.accountId, accountId) });

  if (body?.sharedDrive === null) {
    await db.delete(tiktokDriveLinks).where(eq(tiktokDriveLinks.accountId, accountId));
    await writeAudit({
      actorUserId: auth.userId,
      eventType: "drive.handle_unlinked",
      entityType: "tiktok_account",
      entityId: accountId,
      before,
    });
    return NextResponse.json({ ok: true });
  }

  const sharedDriveId = parseSharedDriveId(body?.sharedDrive);
  if (!sharedDriveId) {
    return NextResponse.json(
      { ok: false, error: "Paste the Shared Drive's link or id." },
      { status: 400 }
    );
  }

  try {
    const name = await (await savedDrive()).checkSharedDrive(sharedDriveId);
    const values = { sharedDriveId, sharedDriveName: name };
    await db
      .insert(tiktokDriveLinks)
      .values({ accountId, ...values })
      .onConflictDoUpdate({ target: tiktokDriveLinks.accountId, set: { ...values, updatedAt: new Date() } });
    await writeAudit({
      actorUserId: auth.userId,
      eventType: "drive.handle_linked",
      entityType: "tiktok_account",
      entityId: accountId,
      before,
      after: { handle: account.handle, ...values },
    });
    return NextResponse.json({ ok: true, name });
  } catch (err) {
    return errorResponse(err, "link drive");
  }
}
