import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { watiConnections, whatsappContacts } from "@/db/schema";
import { eventTypeOf, parseInbound } from "@/lib/wati/payload";

/**
 * WATI webhook — one URL per connected WATI account:
 *   /api/webhooks/wati/<webhook_key>
 *
 * WATI does not sign webhooks, so the random key in the path IS the check: an
 * unknown or switched-off key gets 404 and nothing is written. Admins copy the
 * URL from Admin → Integrations into WATI → Webhooks.
 *
 * Every call stamps the connection's last event (so WATI's "sample callback"
 * flips the card to connected). A customer message also upserts that phone into
 * `whatsapp_contacts`, keeping the EARLIEST message as first contact no matter
 * what order WATI delivers or retries in — a lead is counted once per phone.
 */
const KEY_RE = /^[A-Za-z0-9_-]{32,100}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!KEY_RE.test(key)) return new NextResponse("not found", { status: 404 });

  const connection = await db.query.watiConnections.findFirst({
    where: and(eq(watiConnections.webhookKey, key), eq(watiConnections.isActive, true)),
    columns: { id: true },
  });
  if (!connection) return new NextResponse("not found", { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const now = new Date();
  await db
    .update(watiConnections)
    .set({ lastEventAt: now, lastEventType: eventTypeOf(body), updatedAt: now })
    .where(eq(watiConnections.id, connection.id));

  const msg = parseInbound(body, now);
  if (!msg) return NextResponse.json({ ok: true, stored: false });

  const ex = sql.raw("excluded");
  await db
    .insert(whatsappContacts)
    .values({
      connectionId: connection.id,
      phone: msg.phone,
      name: msg.name,
      channelPhone: msg.channelPhone,
      firstMessageAt: msg.at,
      lastMessageAt: msg.at,
      firstMessageText: msg.text,
    })
    .onConflictDoUpdate({
      target: [whatsappContacts.connectionId, whatsappContacts.phone],
      set: {
        // A retried or late-delivered older message can still be the first one.
        firstMessageText: sql`case when ${ex}.first_message_at < ${whatsappContacts.firstMessageAt} then ${ex}.first_message_text else ${whatsappContacts.firstMessageText} end`,
        firstMessageAt: sql`least(${whatsappContacts.firstMessageAt}, ${ex}.first_message_at)`,
        lastMessageAt: sql`greatest(${whatsappContacts.lastMessageAt}, ${ex}.last_message_at)`,
        name: sql`coalesce(${ex}.name, ${whatsappContacts.name})`,
        channelPhone: sql`coalesce(${whatsappContacts.channelPhone}, ${ex}.channel_phone)`,
        updatedAt: now,
      },
    });

  return NextResponse.json({ ok: true, stored: true });
}
