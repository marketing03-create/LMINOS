import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokLiveSessions } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import {
  MANUAL_TIKTOK_FIELDS,
  type ManualTikTokField,
} from "@/lib/tiktok-live/queries";

/**
 * Save the manually-entered TikTok-backend metrics for a live session (unique
 * viewers, watch duration, DMs, diamonds, …) — the TikTok-only numbers the
 * public connector can't capture. Admin auth. Each field: a non-negative
 * integer, or null/"" to clear.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const set: { [K in ManualTikTokField]?: number | null } & {
    updatedAt?: Date;
  } = {};
  for (const f of MANUAL_TIKTOK_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (v === null || v === "") {
      set[f] = null;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { ok: false, error: `Invalid value for ${f} — use a number ≥ 0.` },
        { status: 400 }
      );
    }
    set[f] = Math.round(n);
  }
  if (Object.keys(set).length === 0) {
    return NextResponse.json(
      { ok: false, error: "nothing to update" },
      { status: 400 }
    );
  }
  set.updatedAt = new Date();

  const [row] = await db
    .update(tiktokLiveSessions)
    .set(set)
    .where(eq(tiktokLiveSessions.id, id))
    .returning({ id: tiktokLiveSessions.id });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "tiktok_live_session.manual_metrics",
    entityType: "tiktok_live_session",
    entityId: id,
    after: set,
  });
  return NextResponse.json({ ok: true });
}
