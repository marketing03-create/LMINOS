import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/authorize";

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

function parse(body: Body | null) {
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  // Real endpoints are https URLs on a push service; anything else is junk.
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh || !auth) {
    return null;
  }
  return { endpoint, p256dh, auth };
}

/**
 * Save this device for the signed-in user. Upserts on the endpoint: a shared
 * phone that signs in as someone else moves to them rather than notifying both.
 */
export async function POST(request: NextRequest) {
  const me = await getSessionUser();
  if (!me?.userId) return new NextResponse("unauthorized", { status: 401 });

  const sub = parse((await request.json().catch(() => null)) as Body | null);
  if (!sub) return NextResponse.json({ ok: false, error: "invalid subscription" }, { status: 400 });

  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
  await db
    .insert(pushSubscriptions)
    .values({ userId: me.userId, ...sub, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: me.userId, p256dh: sub.p256dh, auth: sub.auth, userAgent, updatedAt: new Date() },
    });
  return NextResponse.json({ ok: true });
}

/** Forget this device (the caller's own row only). */
export async function DELETE(request: NextRequest) {
  const me = await getSessionUser();
  if (!me?.userId) return new NextResponse("unauthorized", { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") {
    return NextResponse.json({ ok: false, error: "endpoint required" }, { status: 400 });
  }
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, me.userId), eq(pushSubscriptions.endpoint, body.endpoint)));
  return NextResponse.json({ ok: true });
}
