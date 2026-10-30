import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { watiConnections } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { decryptToken, encryptToken } from "@/lib/crypto/envelope";
import { cleanEndpoint, cleanToken, newWebhookKey, testWatiApi } from "@/lib/wati/api";

/**
 * Change one WATI connection. Admin auth. Body is one of:
 *   { action: "test" }        — call WATI's API with the saved endpoint + token
 *   { action: "rotate-key" }  — new webhook URL; the old one stops working
 *   { name?, apiEndpoint?, apiToken?, isActive? } — edit
 *
 * There is deliberately no delete: the contacts under a connection are the lead
 * history. Switching it off stops the webhook and keeps the history.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const conn = await db.query.watiConnections.findFirst({
    where: eq(watiConnections.id, id),
  });
  if (!conn) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    name?: string;
    apiEndpoint?: string;
    apiToken?: string;
    isActive?: boolean;
  } | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });

  if (body.action === "test") {
    if (!conn.apiEndpoint || !conn.apiTokenEnc) {
      return NextResponse.json(
        { ok: false, error: "Add the API endpoint and token first." },
        { status: 400 }
      );
    }
    let token: string;
    try {
      token = decryptToken(conn.apiTokenEnc);
    } catch {
      return NextResponse.json(
        { ok: false, error: "The saved token can't be read. Paste it again." },
        { status: 500 }
      );
    }
    const result = await testWatiApi(conn.apiEndpoint, token);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  if (body.action === "rotate-key") {
    await db
      .update(watiConnections)
      .set({ webhookKey: newWebhookKey(), updatedAt: new Date() })
      .where(eq(watiConnections.id, id));
    await writeAudit({
      actorUserId: auth.userId,
      eventType: "wati.webhook_rotated",
      entityType: "wati_connection",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  }

  const set: Partial<typeof watiConnections.$inferInsert> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60);
    if (!name) return NextResponse.json({ ok: false, error: "Give it a name." }, { status: 400 });
    set.name = name;
  }
  if (body.apiEndpoint !== undefined) {
    const raw = String(body.apiEndpoint).trim();
    const cleaned = raw ? cleanEndpoint(raw) : null;
    if (raw && !cleaned) {
      return NextResponse.json(
        { ok: false, error: "That isn't a WATI API endpoint." },
        { status: 400 }
      );
    }
    set.apiEndpoint = cleaned;
  }
  // Empty token = keep the saved one. The token is never sent back to the page,
  // so the field is always blank when the form opens.
  if (body.apiToken !== undefined && String(body.apiToken).trim() !== "") {
    const token = cleanToken(body.apiToken);
    if (!token) return NextResponse.json({ ok: false, error: "That token looks wrong." }, { status: 400 });
    set.apiTokenEnc = encryptToken(token);
  }
  if (body.isActive !== undefined) set.isActive = !!body.isActive;

  if (Object.keys(set).length === 0) return NextResponse.json({ ok: true });

  await db
    .update(watiConnections)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(watiConnections.id, id));

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "wati.updated",
    entityType: "wati_connection",
    entityId: id,
    before: { name: conn.name, api_endpoint: conn.apiEndpoint, is_active: conn.isActive },
    after: {
      name: set.name ?? conn.name,
      api_endpoint: set.apiEndpoint !== undefined ? set.apiEndpoint : conn.apiEndpoint,
      is_active: set.isActive ?? conn.isActive,
      token_changed: set.apiTokenEnc !== undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
