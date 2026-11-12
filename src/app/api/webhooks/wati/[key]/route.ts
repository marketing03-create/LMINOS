import { after, NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { watiConnections, whatsappContacts } from "@/db/schema";
import {
  countsAsReply,
  eventTypeOf,
  keysOf,
  messageText,
  parseInbound,
  parseOutbound,
} from "@/lib/wati/payload";
import { catchUpQuietAccounts, maintainConnection } from "@/lib/wati/missed";
import { recordChatDay } from "@/lib/wati/chats";

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
 * A CS message sets that lead's first human reply (see countsAsReply) — though
 * WATI turns out not to send these for Team Inbox / app replies, so reply times
 * mostly come from the API read in `maintainConnection` (lib/wati/missed.ts),
 * which runs after the response.
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

  // Reply times from the API, then missed-lead alerts — throttled inside.
  after(() => maintainConnection(connection.id));
  // Accounts whose own webhook has gone silent are caught up from the API here.
  after(() => catchUpQuietAccounts(connection.id));

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
      columns: { id: true, firstMessageAt: true, watiConversationId: true },
    });
    if (lead) {
      // Our messages carry the chat id too — keep it for the log's Chat button.
      if (out.conversationId && lead.watiConversationId !== out.conversationId) {
        await db
          .update(whatsappContacts)
          .set({ watiConversationId: out.conversationId })
          .where(eq(whatsappContacts.id, lead.id));
      }
      // The log's "Newest message", when this is newer than what we have.
      await db
        .update(whatsappContacts)
        .set({ latestMessageText: out.text, latestMessageAt: out.at, latestMessageFrom: "cs" })
        .where(
          and(
            eq(whatsappContacts.id, lead.id),
            or(
              isNull(whatsappContacts.latestMessageAt),
              lt(whatsappContacts.latestMessageAt, sql`${out.at.toISOString()}::timestamptz`)
            )
          )
        );
    }
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
  const [saved] = await db
    .insert(whatsappContacts)
    .values({
      connectionId: connection.id,
      phone: msg.phone,
      name: msg.name,
      channelPhone: msg.channelPhone,
      firstMessageAt: msg.at,
      lastMessageAt: msg.at,
      firstMessageText: msg.text,
      watiConversationId: msg.conversationId,
      latestMessageText: msg.text ?? messageText(body as Record<string, unknown>),
      latestMessageAt: msg.at,
      latestMessageFrom: "customer",
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
        watiConversationId: sql`coalesce(${ex}.wati_conversation_id, ${whatsappContacts.watiConversationId})`,
        // "Newest message" only moves forward (WATI can retry or deliver late).
        latestMessageText: sql`case when ${whatsappContacts.latestMessageAt} is null or ${ex}.latest_message_at >= ${whatsappContacts.latestMessageAt} then ${ex}.latest_message_text else ${whatsappContacts.latestMessageText} end`,
        latestMessageFrom: sql`case when ${whatsappContacts.latestMessageAt} is null or ${ex}.latest_message_at >= ${whatsappContacts.latestMessageAt} then ${ex}.latest_message_from else ${whatsappContacts.latestMessageFrom} end`,
        latestMessageAt: sql`greatest(${whatsappContacts.latestMessageAt}, ${ex}.latest_message_at)`,
        updatedAt: now,
      },
    })
    .returning({ id: whatsappContacts.id, channelPhone: whatsappContacts.channelPhone });

  // That they wrote TODAY (on this number) — what WATI's inbox counts as a chat.
  // Best-effort: a hiccup here must not make WATI retry the whole message.
  if (saved) {
    await recordChatDay(saved.id, msg.channelPhone ?? saved.channelPhone, msg.at).catch((err) =>
      console.error("[wati] chat day not recorded:", err instanceof Error ? err.message : err)
    );
  }

  return NextResponse.json({ ok: true, stored: true });
}
