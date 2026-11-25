import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { linkTikTokDmChannel } from "@/lib/wati/tiktok";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Link a TikTok DM channel (a TikTok account connected in WATI) to the TT Stars
 * handle its DMs belong to. Admin auth. Body: { id, accountId | null }.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { id?: unknown; accountId?: unknown } | null;
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : "";
  const accountId = body?.accountId === null ? null : typeof body?.accountId === "string" && UUID.test(body.accountId) ? body.accountId : undefined;
  if (!id || accountId === undefined) return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });

  if (!(await linkTikTokDmChannel(id, accountId))) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  await writeAudit({
    actorUserId: auth.userId,
    eventType: "tiktok_dm_channel.linked",
    entityType: "tiktok_dm_channel",
    entityId: id,
    after: { accountId },
  });
  return NextResponse.json({ ok: true });
}
