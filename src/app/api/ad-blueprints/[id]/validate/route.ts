import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { validateBlueprint } from "@/lib/google-ads/build-runner";

// A dry-run :mutate batch against Google can take a while.
export const maxDuration = 300;

/**
 * Dry-run the blueprint against Google Ads (validateOnly — creates NOTHING).
 * Surfaces real policy/limit/access errors so the plan is trustworthy before a
 * live build. Safe to run any time. (Under read-only Explorer access this may
 * return a permission error — validate against a Google test account, or once
 * Basic access is granted.)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  try {
    const result = await validateBlueprint(id);
    await writeAudit({
      actorUserId: auth.userId,
      eventType: "ads_blueprint.validated",
      entityType: "ad_blueprint",
      entityId: id,
      after: { ok: result.ok, error: result.error ?? null },
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
