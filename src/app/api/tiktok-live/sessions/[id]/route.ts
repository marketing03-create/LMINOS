import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokLiveSessions } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import {
  AUTO_TIKTOK_FIELDS,
  MANUAL_TIKTOK_FIELDS,
  streamerOwnsSession,
  type AutoTikTokField,
  type ManualTikTokField,
} from "@/lib/tiktok-live/queries";
import { filterTikTokProducts } from "@/lib/tiktok-live/products";

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
  const auth = await requireRole([...ADMIN_ROLES, "live_streamer"]);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;

  // A streamer may only edit a session on a handle assigned to them.
  if (auth.role === "live_streamer") {
    if (!auth.userId || !(await streamerOwnsSession(auth.userId, id))) {
      return new NextResponse("forbidden — not your live", { status: 403 });
    }
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const set: { [K in ManualTikTokField]?: number | null } & {
    [K in AutoTikTokField]?: number;
  } & {
    updatedAt?: Date;
    products?: string[] | null;
    keywordLeads?: number;
    durationSeconds?: number;
    remarks?: string | null;
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

  // Connector-captured metrics (Views, Peak/Avg viewers, Likes, Comments,
  // Shares, New followers) — normally auto, but editable here to correct a
  // miscapture or fill in a past live. These columns are NOT NULL, so a blank
  // means zero, not "leave unchanged".
  for (const f of AUTO_TIKTOK_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    const n = v === null || v === "" ? 0 : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { ok: false, error: `Invalid value for ${f} — use a number ≥ 0.` },
        { status: 400 }
      );
    }
    set[f] = Math.round(n);
  }

  // Duration entered in minutes → stored as seconds.
  if ("durationMinutes" in body) {
    const v = body.durationMinutes;
    const n = v === null || v === "" ? 0 : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid duration — use a number of minutes ≥ 0." },
        { status: 400 }
      );
    }
    set.durationSeconds = Math.round(n) * 60;
  }

  // Comment "PM" count (keyword_leads) — normally captured automatically, but
  // editable here to correct a miscount. NOT NULL, so a blank is ignored.
  if ("keywordLeads" in body) {
    const v = body.keywordLeads;
    if (!(v === null || v === "")) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { ok: false, error: "Invalid value for keywordLeads — use a number ≥ 0." },
          { status: 400 }
        );
      }
      set.keywordLeads = Math.round(n);
    }
  }

  // The streamer-tagged product(s)/service(s) for this live (validated against
  // the allowed list; an empty list clears the tag).
  if ("products" in body) {
    const cleaned = filterTikTokProducts(body.products);
    set.products = cleaned.length > 0 ? cleaned : null;
  }

  // Free-text remarks the streamer/admin writes about this live. Stored as-is
  // (React escapes it on display), trimmed, capped, and cleared when blank.
  if ("remarks" in body) {
    const v = body.remarks;
    if (v === null || v === "") {
      set.remarks = null;
    } else if (typeof v === "string") {
      set.remarks = v.trim().slice(0, 2000) || null;
    } else {
      return NextResponse.json(
        { ok: false, error: "Invalid remarks — must be text." },
        { status: 400 }
      );
    }
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
