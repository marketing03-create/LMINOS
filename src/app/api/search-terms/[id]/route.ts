import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { searchTermAnalyses } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { LEVELS, MATCH_TYPES } from "@/lib/ai/search-terms-core";

/**
 * Edit a reviewer's override of one term analysis — the negative keyword, its
 * match type / level, and notes. The AI's ORIGINAL suggestion is never
 * overwritten (those live in the suggested* columns); edits go to edited*.
 * Marks the row EDITED. Admin auth.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    editedNegativeKeyword?: string | null;
    editedMatchType?: string | null;
    editedLevel?: string | null;
    notes?: string | null;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const matchType = body.editedMatchType ?? null;
  const level = body.editedLevel ?? null;
  if (matchType && !(MATCH_TYPES as readonly string[]).includes(matchType)) {
    return NextResponse.json(
      { ok: false, error: `Invalid match type: ${matchType}` },
      { status: 400 }
    );
  }
  if (level && !(LEVELS as readonly string[]).includes(level)) {
    return NextResponse.json(
      { ok: false, error: `Invalid level: ${level}` },
      { status: 400 }
    );
  }

  const { id } = await params;
  const [row] = await db
    .update(searchTermAnalyses)
    .set({
      editedNegativeKeyword: body.editedNegativeKeyword?.trim() || null,
      editedMatchType: (matchType as (typeof MATCH_TYPES)[number] | null) ?? null,
      editedLevel: (level as (typeof LEVELS)[number] | null) ?? null,
      notes: body.notes?.trim() || null,
      reviewStatus: "EDITED",
      reviewedByUserId: auth.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(searchTermAnalyses.id, id))
    .returning({ id: searchTermAnalyses.id });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "search_term.edited",
    entityType: "search_term_analysis",
    entityId: id,
    after: {
      editedNegativeKeyword: body.editedNegativeKeyword ?? null,
      editedMatchType: matchType,
      editedLevel: level,
    },
  });
  return NextResponse.json({ ok: true });
}
