import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { whatsappContacts } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

/**
 * POST { id } → that customer's full phone number, for the WhatsApp log's
 * "Show" button. Admins only, one number per call, and every reveal is written
 * to the Audit log (who and which customer — never the number itself).
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  const [row] = await db
    .select({ phone: whatsappContacts.phone })
    .from(whatsappContacts)
    .where(eq(whatsappContacts.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "whatsapp.phone_revealed",
    entityType: "whatsapp_contact",
    entityId: id,
    after: {},
  });
  return NextResponse.json({ ok: true, phone: row.phone });
}
