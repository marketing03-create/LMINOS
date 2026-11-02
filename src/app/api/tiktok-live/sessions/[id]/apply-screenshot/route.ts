import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokLiveSessions, tiktokScreenshotUploads } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import {
  AUTO_TIKTOK_FIELDS,
  MANUAL_TIKTOK_FIELDS,
  streamerOwnsSession,
  type AutoTikTokField,
  type ManualTikTokField,
} from "@/lib/tiktok-live/queries";

const AUTO = new Set<string>(AUTO_TIKTOK_FIELDS);
const MANUAL = new Set<string>(MANUAL_TIKTOK_FIELDS);

/**
 * Apply screenshot numbers to one live session. The uploaded screenshot is
 * TikTok's OFFICIAL figures, so it overwrites EVERY field — including the
 * connector-captured ones (Views, Likes, …). Admin + streamer auth, a distinct
 * audit event. Targets FINISHED lives, so the connector's GREATEST() upserts
 * never run again to clobber these. If a streamer saves numbers that differ from
 * what the screenshot showed, a separate mismatch audit is recorded for admins.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole([...ADMIN_ROLES, "live_streamer"]);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;

  // A streamer may only write to a session on a handle assigned to them.
  if (auth.role === "live_streamer") {
    if (!auth.userId || !(await streamerOwnsSession(auth.userId, id))) {
      return new NextResponse("forbidden — not your live", { status: 403 });
    }
  }

  const body = (await request.json().catch(() => null)) as {
    values?: Record<string, unknown>;
    // What the AI read off the screenshot (immutable), so we can flag when a
    // streamer saved something different from what the screenshot showed.
    screenshotValues?: Record<string, unknown>;
  } | null;
  const values = body?.values;
  if (!values || typeof values !== "object") {
    return NextResponse.json({ ok: false, error: "values required" }, { status: 400 });
  }

  // AUTO columns are NOT NULL (typed `number`); MANUAL columns are nullable.
  const auto: Partial<Record<AutoTikTokField, number>> = {};
  const manual: Partial<Record<ManualTikTokField, number | null>> = {};
  // Comment "PM" count (keyword_leads) — auto-captured, but editable here to
  // correct a miscount. NOT NULL, so a blank leaves the current count unchanged.
  const comment: { keywordLeads?: number } = {};
  for (const [col, raw] of Object.entries(values)) {
    if (col === "keywordLeads") {
      if (raw === null || raw === "") continue; // blank = keep the auto count
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { ok: false, error: `Invalid value for ${col} — use a number ≥ 0.` },
          { status: 400 }
        );
      }
      comment.keywordLeads = Math.round(n);
    } else if (AUTO.has(col)) {
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

  // Fetch the session first for the before-snapshot stored in the audit log.
  const [beforeRow] = await db
    .select()
    .from(tiktokLiveSessions)
    .where(eq(tiktokLiveSessions.id, id))
    .limit(1);
  if (!beforeRow) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const changedKeys = [...Object.keys(auto), ...Object.keys(manual), ...Object.keys(comment)];
  if (changedKeys.length === 0) {
    return NextResponse.json({ ok: false, error: "nothing to apply" }, { status: 400 });
  }

  const before: Record<string, unknown> = {};
  for (const k of changedKeys) before[k] = (beforeRow as Record<string, unknown>)[k];

  await db
    .update(tiktokLiveSessions)
    .set({ ...auto, ...manual, ...comment, updatedAt: new Date() })
    .where(eq(tiktokLiveSessions.id, id));

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "tiktok_live_session.screenshot_import",
    entityType: "tiktok_live_session",
    entityId: id,
    before,
    after: { ...auto, ...manual, ...comment },
  });

  // Flag for admin review when a LIVE STREAMER saved numbers that differ from
  // what the screenshot actually showed (a misread they corrected — or a number
  // they changed by hand). Admins editing is their own call, so only streamer
  // edits are flagged. Surfaced as a popup on Admin → TikTok Live (never shown
  // to streamers, who can't reach that page).
  const screenshotValues =
    body.screenshotValues && typeof body.screenshotValues === "object"
      ? body.screenshotValues
      : null;
  if (auth.role === "live_streamer" && screenshotValues) {
    const applied: Record<string, number | null> = { ...auto, ...manual, ...comment };
    const mismatches: { field: string; screenshot: number; entered: number | null }[] = [];
    for (const [field, raw] of Object.entries(screenshotValues)) {
      const scr = Number(raw);
      if (!Number.isFinite(scr) || !(field in applied)) continue;
      const entered = applied[field];
      if (entered !== Math.round(scr)) {
        mismatches.push({ field, screenshot: Math.round(scr), entered: entered ?? null });
      }
    }
    if (mismatches.length > 0) {
      await writeAudit({
        actorUserId: auth.userId,
        eventType: "tiktok_live_session.screenshot_mismatch",
        entityType: "tiktok_live_session",
        entityId: id,
        after: { mismatches },
      });
    }
  }

  // Best-effort: link this uploader's recent, still-unlinked screenshot uploads
  // to the session they were just applied to, so the audit history shows which
  // live each screenshot backs. (Import → review → apply happens within minutes.)
  if (auth.userId) {
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await db
        .update(tiktokScreenshotUploads)
        .set({ appliedSessionId: id })
        .where(
          and(
            eq(tiktokScreenshotUploads.uploaderUserId, auth.userId),
            isNull(tiktokScreenshotUploads.appliedSessionId),
            gte(tiktokScreenshotUploads.createdAt, twoHoursAgo)
          )
        );
    } catch {
      // linking is a convenience for the audit view — never fail the apply
    }
  }

  return NextResponse.json({ ok: true });
}
