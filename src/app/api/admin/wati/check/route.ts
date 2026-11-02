import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { crossCheckAll } from "@/lib/wati/crosscheck";
import { mytYesterday } from "@/lib/wati/crosscheck-core";

/**
 * POST { day? } — run the WATI cross-check now for every account (default:
 * yesterday, Malaysia time). Admins only. Reads WATI; writes only the results.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { day?: unknown } | null;
  const day =
    typeof body?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : mytYesterday();
  if (day > mytYesterday(new Date(Date.now() + 86_400_000))) {
    return NextResponse.json({ ok: false, error: "That day hasn't happened yet." }, { status: 400 });
  }

  const rows = await crossCheckAll(day);
  await writeAudit({
    actorUserId: auth.userId,
    eventType: "wati.cross_check",
    entityType: "wati_daily_check",
    entityId: day,
    after: { accounts: rows.length },
  });
  return NextResponse.json({ ok: true, day });
}
