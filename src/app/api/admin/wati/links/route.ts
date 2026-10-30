import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokWaLinks, watiConnections } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { cleanCode } from "@/lib/wati/attribution";
import { normalizePhone } from "@/lib/wati/payload";

/**
 * Link a TikTok handle to the WATI account (and number) its leads arrive on —
 * or unlink it with `connectionId: null`. Admin auth. One link per handle.
 *
 * Body: { accountId, connectionId | null, channelPhone?, code?, autoFillTotalLeads? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    accountId?: string;
    connectionId?: string | null;
    channelPhone?: string | null;
    code?: string | null;
    autoFillTotalLeads?: boolean;
  } | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  if (!accountId) return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });

  const account = await db.query.tiktokAccounts.findFirst({
    where: eq(tiktokAccounts.id, accountId),
    columns: { id: true, handle: true },
  });
  if (!account) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const before = await db.query.tiktokWaLinks.findFirst({ where: eq(tiktokWaLinks.accountId, accountId) });

  if (body?.connectionId === null) {
    await db.delete(tiktokWaLinks).where(eq(tiktokWaLinks.accountId, accountId));
    await writeAudit({
      actorUserId: auth.userId,
      eventType: "wati.handle_unlinked",
      entityType: "tiktok_account",
      entityId: accountId,
      before,
    });
    return NextResponse.json({ ok: true });
  }

  const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";
  const conn = connectionId
    ? await db.query.watiConnections.findFirst({
        where: eq(watiConnections.id, connectionId),
        columns: { id: true },
      })
    : null;
  if (!conn) return NextResponse.json({ ok: false, error: "Pick a WATI account." }, { status: 400 });

  const phoneRaw = typeof body?.channelPhone === "string" ? body.channelPhone.trim() : "";
  const channelPhone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !channelPhone) {
    return NextResponse.json({ ok: false, error: "That number looks wrong." }, { status: 400 });
  }

  const codeRaw = typeof body?.code === "string" ? body.code.trim() : "";
  const code = codeRaw ? cleanCode(codeRaw) : null;
  if (codeRaw && !code) {
    return NextResponse.json(
      { ok: false, error: "Code: 2–12 letters or digits, no spaces." },
      { status: 400 }
    );
  }
  if (code) {
    const taken = await db.query.tiktokWaLinks.findFirst({
      where: and(eq(tiktokWaLinks.code, code), ne(tiktokWaLinks.accountId, accountId)),
      columns: { accountId: true },
    });
    if (taken) {
      return NextResponse.json({ ok: false, error: "Another handle already uses that code." }, { status: 409 });
    }
  }

  const values = {
    connectionId,
    channelPhone,
    code,
    autoFillTotalLeads: !!body?.autoFillTotalLeads,
  };
  await db
    .insert(tiktokWaLinks)
    .values({ accountId, ...values })
    .onConflictDoUpdate({
      target: tiktokWaLinks.accountId,
      set: { ...values, updatedAt: new Date() },
    });

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "wati.handle_linked",
    entityType: "tiktok_account",
    entityId: accountId,
    before,
    after: { handle: account.handle, ...values },
  });
  return NextResponse.json({ ok: true });
}
