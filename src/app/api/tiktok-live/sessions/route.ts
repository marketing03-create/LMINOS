import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokAccounts, tiktokLiveSessions } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import {
  AUTO_TIKTOK_FIELDS,
  MANUAL_TIKTOK_FIELDS,
  streamerAccountIds,
} from "@/lib/tiktok-live/queries";
import { filterTikTokProducts } from "@/lib/tiktok-live/products";

const AUTO = new Set<string>(AUTO_TIKTOK_FIELDS);
const MANUAL = new Set<string>(MANUAL_TIKTOK_FIELDS);

/**
 * Create a PAST live session by hand — for lives the tracker missed (e.g. it was
 * down 3–6 Jul). Only way to backfill, since finished lives can't be pulled from
 * TikTok. Admin or the streamer who owns the handle. Date + start time are read
 * as Malaysia time (UTC+8); the synthetic `externalSessionId` (manual-<epoch>)
 * keeps it idempotent so re-submitting the same live can't duplicate it.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole([...ADMIN_ROLES, "live_streamer"]);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    accountId?: string;
    date?: string; // YYYY-MM-DD (MYT)
    startTime?: string; // HH:MM (MYT)
    durationMinutes?: number;
    title?: string | null;
    values?: Record<string, unknown>;
    products?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "Pick a handle." }, { status: 400 });
  }

  // A streamer may only add a live to a handle assigned to them.
  if (auth.role === "live_streamer") {
    const ids = auth.userId ? await streamerAccountIds(auth.userId) : [];
    if (!ids.includes(accountId)) {
      return new NextResponse("forbidden — not your handle", { status: 403 });
    }
  } else {
    const [acct] = await db
      .select({ id: tiktokAccounts.id })
      .from(tiktokAccounts)
      .where(eq(tiktokAccounts.id, accountId))
      .limit(1);
    if (!acct) {
      return NextResponse.json({ ok: false, error: "Handle not found." }, { status: 404 });
    }
  }

  const date = typeof body.date === "string" ? body.date : "";
  const startTime = typeof body.startTime === "string" ? body.startTime : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "Pick a date." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return NextResponse.json({ ok: false, error: "Enter a start time (HH:MM)." }, { status: 400 });
  }
  // Interpret the date + time as Malaysia time (UTC+8) → a UTC instant.
  const startedAt = new Date(`${date}T${startTime}:00+08:00`);
  if (Number.isNaN(startedAt.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid date/time." }, { status: 400 });
  }
  const durationMinutes = Math.max(0, Math.round(Number(body.durationMinutes) || 0));
  const durationSeconds = durationMinutes * 60;
  const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

  // Metric values (AUTO ∪ MANUAL). Absent AUTO cols fall back to the schema
  // default (0); MANUAL cols stay null.
  const values = body.values && typeof body.values === "object" ? body.values : {};
  const metrics: Record<string, number | null> = {};
  for (const [col, raw] of Object.entries(values)) {
    if (!AUTO.has(col) && !MANUAL.has(col)) continue;
    if (raw === null || raw === "") {
      if (MANUAL.has(col)) metrics[col] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { ok: false, error: `Invalid value for ${col}.` },
        { status: 400 }
      );
    }
    metrics[col] = Math.round(n);
  }

  const cleanedProducts = filterTikTokProducts(body.products);
  const products = cleanedProducts.length > 0 ? cleanedProducts : null;
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;

  // Idempotent per (account, exact start instant) so a double-submit can't dupe.
  const externalSessionId = `manual-${startedAt.getTime()}`;
  const [dupe] = await db
    .select({ id: tiktokLiveSessions.id })
    .from(tiktokLiveSessions)
    .where(
      and(
        eq(tiktokLiveSessions.accountId, accountId),
        eq(tiktokLiveSessions.externalSessionId, externalSessionId)
      )
    )
    .limit(1);
  if (dupe) {
    return NextResponse.json(
      { ok: false, error: "A live at that exact date + time already exists." },
      { status: 409 }
    );
  }

  const insertValues = {
    accountId,
    externalSessionId,
    title,
    startedAt,
    endedAt,
    durationSeconds,
    products,
    rawPayload: { manual: true, source: "past-live-entry" },
    ...metrics,
  } as typeof tiktokLiveSessions.$inferInsert;

  const [row] = await db
    .insert(tiktokLiveSessions)
    .values(insertValues)
    .returning({ id: tiktokLiveSessions.id });

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "tiktok_live_session.manual_created",
    entityType: "tiktok_live_session",
    entityId: row.id,
    after: { accountId, startedAt, durationSeconds, products, ...metrics },
  });

  return NextResponse.json({ ok: true, id: row.id });
}
