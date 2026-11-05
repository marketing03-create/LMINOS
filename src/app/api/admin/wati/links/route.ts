import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokWaLinks, watiConnections } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { cleanCode } from "@/lib/wati/attribution";
import { normalizePhone } from "@/lib/wati/payload";

/**
 * Set every WATI account + number a TikTok handle's leads arrive on — a
 * streamer can have several CS numbers, even on several WATI accounts. Admin auth.
 *
 * Body: { accountId, links: { connectionId, phone }[], code?, autoFillTotalLeads? }
 *  - `links` replaces all of the handle's links; phone "" = any number on that
 *    account. An empty list unlinks the handle.
 *  - `code` and `autoFillTotalLeads` belong to the handle (same on every row).
 *  - `{ accountId, connectionId: null }` (older clients) unlinks it too.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    accountId?: string;
    connectionId?: string | null;
    links?: unknown;
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

  if (!Array.isArray(body?.links) || body.links.length > 20) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const known = new Set(
    (await db.select({ id: watiConnections.id }).from(watiConnections)).map((c) => c.id)
  );
  // connectionId -> numbers (null = any number on that account).
  const wanted = new Map<string, Set<string | null>>();
  for (const raw of body.links as unknown[]) {
    const l = (raw ?? {}) as { connectionId?: unknown; phone?: unknown };
    const connectionId = typeof l.connectionId === "string" ? l.connectionId : "";
    if (!known.has(connectionId)) {
      return NextResponse.json({ ok: false, error: "Pick a WATI account for every number." }, { status: 400 });
    }
    const typed = typeof l.phone === "string" ? l.phone.trim() : "";
    const phone = typed ? normalizePhone(typed) : null;
    if (typed && !phone) {
      return NextResponse.json({ ok: false, error: `${typed} doesn't look like a phone number.` }, { status: 400 });
    }
    const set = wanted.get(connectionId) ?? new Set<string | null>();
    set.add(phone);
    wanted.set(connectionId, set);
  }
  // "Any number" already covers every number on that account.
  const rows = [...wanted].flatMap(([connectionId, phones]) =>
    (phones.has(null) ? [null] : [...phones]).map((channelPhone) => ({ connectionId, channelPhone }))
  );

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
    await tx.delete(tiktokWaLinks).where(eq(tiktokWaLinks.accountId, accountId));
    if (rows.length > 0) {
      await tx.insert(tiktokWaLinks).values(rows.map((r) => ({ accountId, ...r, ...handleSettings })));
    }
  });

  await writeAudit({
    actorUserId: auth.userId,
    eventType: rows.length > 0 ? "wati.handle_linked" : "wati.handle_unlinked",
    entityType: "tiktok_account",
    entityId: accountId,
    before,
    after: { handle: account.handle, links: rows, ...handleSettings },
  });
  return NextResponse.json({ ok: true });
}
