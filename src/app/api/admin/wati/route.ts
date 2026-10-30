import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { watiConnections } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { encryptToken } from "@/lib/crypto/envelope";
import { cleanEndpoint, cleanToken, newWebhookKey } from "@/lib/wati/api";

/**
 * Connect a WATI account. Admin auth. Only a name is required — the webhook URL
 * it gets back is all WATI needs to start sending messages. The API endpoint +
 * token are optional at this stage and stored encrypted.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    apiEndpoint?: string;
    apiToken?: string;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) {
    return NextResponse.json({ ok: false, error: "Give it a name." }, { status: 400 });
  }

  const endpointRaw = body?.apiEndpoint?.trim() ?? "";
  const apiEndpoint = endpointRaw ? cleanEndpoint(endpointRaw) : null;
  if (endpointRaw && !apiEndpoint) {
    return NextResponse.json(
      { ok: false, error: "That isn't a WATI API endpoint." },
      { status: 400 }
    );
  }
  const tokenRaw = body?.apiToken?.trim() ?? "";
  const apiToken = tokenRaw ? cleanToken(tokenRaw) : null;
  if (tokenRaw && !apiToken) {
    return NextResponse.json({ ok: false, error: "That token looks wrong." }, { status: 400 });
  }

  const [row] = await db
    .insert(watiConnections)
    .values({
      name,
      webhookKey: newWebhookKey(),
      apiEndpoint,
      apiTokenEnc: apiToken ? encryptToken(apiToken) : null,
    })
    .returning({ id: watiConnections.id });

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "wati.connected",
    entityType: "wati_connection",
    entityId: row.id,
    after: { name, api_endpoint: apiEndpoint, has_token: !!apiToken },
  });

  return NextResponse.json({ ok: true, id: row.id });
}
