import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { tiktokAccounts } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";

function normHandle(s: string): string {
  return s.trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
}

/** Register a TikTok handle to track its LIVE sessions. Admin auth. */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    handle?: string;
    displayName?: string;
  } | null;
  const handle = normHandle(body?.handle ?? "");
  const displayName = (body?.displayName ?? "").trim() || handle;
  if (!handle) {
    return NextResponse.json(
      { ok: false, error: "TikTok @handle is required." },
      { status: 400 }
    );
  }

  const [row] = await db
    .insert(tiktokAccounts)
    .values({ handle, displayName })
    .onConflictDoNothing({ target: tiktokAccounts.handle })
    .returning({ id: tiktokAccounts.id });
  if (!row) {
    return NextResponse.json(
      { ok: false, error: `@${handle} is already tracked.` },
      { status: 409 }
    );
  }

  await writeAudit({
    actorUserId: auth.userId,
    eventType: "tiktok_account.created",
    entityType: "tiktok_account",
    entityId: row.id,
    after: { handle, displayName },
  });

  return NextResponse.json({ ok: true, id: row.id, handle });
}
