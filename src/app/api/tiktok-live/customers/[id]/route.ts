import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { customerFolders, tiktokLiveSessions } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { errorResponse, inScope, requireCustomerRole, scopeFor } from "@/lib/drive/api";
import { cleanName } from "@/lib/drive/core";
import { updateCustomer } from "@/lib/drive/customers";
import { normalizePhone } from "@/lib/wati/payload";

/**
 * Fix a customer's name, phone or live. The Drive folder is renamed to match.
 * The live must be on the same handle (the folder can't change Shared Drive).
 *
 * Body: { name, phone, sessionId }
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomerRole();
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const row = await db.query.customerFolders.findFirst({
    where: eq(customerFolders.id, id),
    columns: { id: true, accountId: true, customerName: true, phone: true, sessionId: true },
  });
  const scope = await scopeFor(auth);
  if (!row || !inScope(scope, row.accountId)) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    phone?: unknown;
    sessionId?: unknown;
  } | null;
  const name = cleanName(body?.name);
  const phone = typeof body?.phone === "string" ? normalizePhone(body.phone) : null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!name) return NextResponse.json({ ok: false, error: "Type the customer's name." }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: "That phone number looks wrong." }, { status: 400 });

  const session = /^[0-9a-f-]{36}$/i.test(sessionId)
    ? await db.query.tiktokLiveSessions.findFirst({
        where: eq(tiktokLiveSessions.id, sessionId),
        columns: { accountId: true },
      })
    : null;
  if (!session || session.accountId !== row.accountId) {
    return NextResponse.json({ ok: false, error: "Pick a live on the same TikTok account." }, { status: 400 });
  }

  try {
    await updateCustomer(id, { name, phone, sessionId });
    await writeAudit({
      actorUserId: auth.userId,
      eventType: "drive.customer_updated",
      entityType: "customer_folder",
      entityId: id,
      before: { sessionId: row.sessionId, phoneLast4: row.phone.slice(-4) },
      after: { sessionId, phoneLast4: phone.slice(-4) },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "update customer");
  }
}
