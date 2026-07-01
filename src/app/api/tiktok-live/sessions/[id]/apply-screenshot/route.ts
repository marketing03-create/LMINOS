import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokLiveSessions } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import {
  AUTO_TIKTOK_FIELDS,
  MANUAL_TIKTOK_FIELDS,
  type AutoTikTokField,
  type ManualTikTokField,
} from "@/lib/tiktok-live/queries";

const AUTO = new Set<string>(AUTO_TIKTOK_FIELDS);
const MANUAL = new Set<string>(MANUAL_TIKTOK_FIELDS);

/**
 * Apply admin-confirmed screenshot numbers to one live session. Writes BOTH the
 * connector-captured fields (AUTO — overwritten with TikTok's official figures)
 * and the manual-only extras. Admin auth + a distinct audit event. Targets
 * FINISHED lives, so the connector's GREATEST() upserts never run again to
 * clobber these.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    values?: Record<string, unknown>;
  } | null;
  const values = body?.values;
  if (!values || typeof values !== "object") {
    return NextResponse.json({ ok: false, error: "values required" }, { status: 400 });
  }

  // AUTO columns are NOT NULL (typed `number`); MANUAL columns are nullable.
  const auto: Partial<Record<AutoTikTokField, number>> = {};
  const manual: Partial<Record<ManualTikTokField, number | null>> = {};
  for (const [col, raw] of Object.entries(values)) {
    if (AUTO.has(col)) {
      if (raw === null || raw === "") {
        return NextResponse.json(
          { ok: false, error: `${col} can't be empty (it's a captured number).` },
          { status: 400 }
        );
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { ok: false, error: `Invalid value for ${col} — use a number ≥ 0.` },
          { status: 400 }
        );
      }
      auto[col as AutoTikTokField] = Math.round(n);
    } else if (MANUAL.has(col)) {
      if (raw === null || raw === "") {
        manual[col as ManualTikTokField] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { ok: false, error: `Invalid value for ${col} — use a number ≥ 0.` },
          { status: 400 }
        );
      }
      manual[col as ManualTikTokField] = Math.round(n);
    }
    // else: not an allow-listed column → ignore
  }

  const changedKeys = [...Object.keys(auto), ...Object.keys(manual)];
  if (changedKeys.length === 0) {
    return NextResponse.json({ ok: false, error: "nothing to apply" }, { status: 400 });
  }

  const [beforeRow] = await db
    .select()
    .from(tiktokLiveSessions)
    .where(eq(tiktokLiveSessions.id, id))
    .limit(1);
  if (!beforeRow) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  const before: Record<string, unknown> = {};
  for (const k of changedKeys) before[k] = (beforeRow as Record<string, unknown>)[k];

  await db
    .update(tiktokLiveSessions)
    .set({ ...auto, ...manual, updatedAt: new Date() })
    .where(eq(tiktokLiveSessions.id, id));

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "tiktok_live_session.screenshot_import",
    entityType: "tiktok_live_session",
    entityId: id,
    before,
    after: { ...auto, ...manual },
  });
  return NextResponse.json({ ok: true });
}
