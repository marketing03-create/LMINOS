import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokLiveSessions } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { errorResponse, inScope, requireCustomerRole, scopeFor } from "@/lib/drive/api";
import { cleanName, folderUrl } from "@/lib/drive/core";
import { createCustomer } from "@/lib/drive/customers";
import { normalizePhone } from "@/lib/wati/payload";

/**
 * New customer: make their folder (with IC / Payslip / Bank Statement) in the
 * live's handle's Shared Drive. A streamer only for lives on their own handles.
 * The same phone on the same handle opens the folder that already exists.
 *
 * Body: { sessionId, name, phone } → { ok, created, id, url }
 */
export async function POST(request: NextRequest) {
  const auth = await requireCustomerRole();
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    sessionId?: unknown;
    name?: unknown;
    phone?: unknown;
  } | null;
  const name = cleanName(body?.name);
  const phone = typeof body?.phone === "string" ? normalizePhone(body.phone) : null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!name) return NextResponse.json({ ok: false, error: "Type the customer's name." }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: "That phone number looks wrong." }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ ok: false, error: "Pick the live." }, { status: 400 });
  }

  const session = await db.query.tiktokLiveSessions.findFirst({
    where: eq(tiktokLiveSessions.id, sessionId),
    columns: { id: true, accountId: true },
  });
  // Someone else's live reads as not found, never as "exists but not yours".
  if (!session || !inScope(await scopeFor(auth), session.accountId)) {
    return NextResponse.json({ ok: false, error: "Live not found." }, { status: 404 });
  }

  try {
    const r = await createCustomer({
      accountId: session.accountId,
      sessionId: session.id,
      name,
      phone,
      userId: auth.userId,
    });
    if (r.created) {
      await writeAudit({
        actorUserId: auth.userId,
        eventType: "drive.customer_created",
        entityType: "customer_folder",
        entityId: r.id,
        // The phone's last four only — the audit log is wider-read than this table.
        after: { sessionId: session.id, phoneLast4: phone.slice(-4) },
      });
    }
    return NextResponse.json({ ok: true, created: r.created, id: r.id, url: folderUrl(r.folderId) });
  } catch (err) {
    return errorResponse(err, "create customer");
  }
}
