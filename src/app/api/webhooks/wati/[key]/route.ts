import { after, NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { watiConnections, whatsappContacts } from "@/db/schema";
import {
  countsAsReply,
  eventTypeOf,
  keysOf,
  parseInbound,
  parseOutbound,
} from "@/lib/wati/payload";
import { sweepMissedLeads } from "@/lib/wati/missed";

/**
 * WATI webhook — one URL per connected WATI account:
 *   /api/webhooks/wati/<webhook_key>
 *
 * WATI does not sign webhooks, so the random key in the path IS the check: an
 * unknown or switched-off key gets 404 and nothing is written. Admins copy the
 * URL from Admin → Integrations into WATI → Webhooks.
 *
 * Every call stamps the connection's last event (so WATI's "sample callback"
 * flips the card to connected). A customer message upserts that phone into
 * `whatsapp_contacts`, keeping the EARLIEST message as first contact no matter
 * what order WATI delivers or retries in — a lead is counted once per phone.
 * A CS message sets that lead's first human reply (see countsAsReply). After
 * responding, the missed-lead sweep may run (lib/wati/missed.ts).
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
    .set({
      lastEventAt: now,
      lastEventType: eventTypeOf(body),
      lastEventKeys: keysOf(body),
      updatedAt: now,
    })
    .where(eq(watiConnections.id, connection.id));

  after(() => sweepMissedLeads(connection.id));

  const out = parseOutbound(body, now);
  if (out) {
    // Reply tracking is on from the first time WATI sends us one of ours.
    await db
      .update(watiConnections)
      .set({ repliesSeenAt: now })
      .where(and(eq(watiConnections.id, connection.id), isNull(watiConnections.repliesSeenAt)));

    const lead = await db.query.whatsappContacts.findFirst({
      where: and(
        eq(whatsappContacts.connectionId, connection.id),
        eq(whatsappContacts.phone, out.phone)
      ),
      columns: { id: true, firstMessageAt: true },
    });
    // CS writing first (no lead row yet), a bot, or a message from before the
    // lead wrote: none of these is a reply to a lead.
    if (!lead || !countsAsReply(out, lead.firstMessageAt)) {
      return NextResponse.json({ ok: true, stored: false });
    }
    await db
      .update(whatsappContacts)
      .set({ firstReplyAt: out.at, firstReplyBy: out.by, updatedAt: now })
      .where(
        and(
          eq(whatsappContacts.id, lead.id),
          gte(sql`${out.at.toISOString()}::timestamptz`, whatsappContacts.firstMessageAt),
          or(isNull(whatsappContacts.firstReplyAt), lt(sql`${out.at.toISOString()}::timestamptz`, whatsappContacts.firstReplyAt))
        )
      );
    return NextResponse.json({ ok: true, stored: true });
  }

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
