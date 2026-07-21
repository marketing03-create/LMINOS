import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { applyNegative } from "@/lib/google-ads/negative-apply";

// A live/validate mutate round-trips to Google.
export const maxDuration = 120;

/**
 * Apply one APPROVED/EDITED negative keyword to Google Ads. DARK by default:
 * until Google Basic write access + ADS_AUTOMATION_ENABLED are both on, this
 * only dry-run-validates and returns the "apply by hand" notice. Admin auth.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const { id } = await params;
  const outcome = await applyNegative(id);

  await writeAudit({
    actorUserId: auth.userId,
    eventType: outcome.applied
      ? "search_term.applied"
      : "search_term.apply_validated",
    entityType: "search_term_analysis",
    entityId: id,
    after: {
      applied: outcome.applied,
      validated: outcome.validated ?? false,
      error: outcome.error ?? null,
    },
  });

  const status = outcome.ok ? 200 : 400;
  return NextResponse.json(outcome, { status });
}
