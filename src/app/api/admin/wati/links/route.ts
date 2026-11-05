import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokWaLinks, watiConnections } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { cleanCode } from "@/lib/wati/attribution";
import { normalizePhone } from "@/lib/wati/payload";

/**
 * Set which numbers on ONE WATI account carry a TikTok handle's leads. A handle
 * can be linked to several WATI accounts (one call each) and several numbers
 * per account. Admin auth.
 *
 * Body: { accountId, connectionId, phones: string[], code?, autoFillTotalLeads? }
 *  - `phones` replaces the handle's numbers on that account; "" = any number.
 *    An empty list unlinks the handle from that account.
 *  - `code` and `autoFillTotalLeads` belong to the handle, so they are written
 *    to all of its links, on every account.
 *  - `{ accountId, connectionId: null }` unlinks the handle everywhere.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    accountId?: string;
    connectionId?: string | null;
    phones?: unknown;
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

  const before = await db.query.tiktokWaLinks.findMany({ where: eq(tiktokWaLinks.accountId, accountId) });

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

  if (!Array.isArray(body?.phones) || body.phones.length > 10) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const phones = new Set<string | null>();
  for (const raw of body.phones) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) {
      phones.add(null);
      continue;
    }
    const p = normalizePhone(s);
    if (!p) return NextResponse.json({ ok: false, error: "That number looks wrong." }, { status: 400 });
    phones.add(p);
  }
  // "Any number" already covers every number on the account.
  const rows = phones.has(null) ? [null] : [...phones];

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
  const handleSettings = { code, autoFillTotalLeads: !!body?.autoFillTotalLeads };

  await db.transaction(async (tx) => {
    await tx
      .delete(tiktokWaLinks)
      .where(and(eq(tiktokWaLinks.accountId, accountId), eq(tiktokWaLinks.connectionId, connectionId)));
    if (rows.length > 0) {
      await tx
        .insert(tiktokWaLinks)
        .values(rows.map((channelPhone) => ({ accountId, connectionId, channelPhone, ...handleSettings })));
    }
    // The handle's other links (other WATI accounts) share its code + auto-fill.
    await tx
      .update(tiktokWaLinks)
      .set({ ...handleSettings, updatedAt: new Date() })
      .where(eq(tiktokWaLinks.accountId, accountId));
  });

  await writeAudit({
    actorUserId: auth.userId,
    eventType: rows.length > 0 ? "wati.handle_linked" : "wati.handle_unlinked",
    entityType: "tiktok_account",
    entityId: accountId,
    before,
    after: { handle: account.handle, connectionId, phones: rows, ...handleSettings },
  });
  return NextResponse.json({ ok: true });
}
