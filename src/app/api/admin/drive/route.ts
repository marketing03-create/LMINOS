import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { driveSettings } from "@/db/schema";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { writeAudit } from "@/lib/audit/write";
import { encryptToken } from "@/lib/crypto/envelope";
import { errorResponse } from "@/lib/drive/api";
import { verifyKey } from "@/lib/drive/client";
import { parseServiceAccountJson } from "@/lib/drive/core";

/**
 * Save the Google service account TT Stars makes customer folders with —
 * replacing any saved one. The key is tried against Google before it is kept.
 * Admin auth.
 *
 * Body: { key: "<the downloaded JSON key, as text>" } → { ok, email }
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const sa = parseServiceAccountJson(body?.key);
  if (!sa) {
    return NextResponse.json(
      { ok: false, error: "That isn't a service account JSON key." },
      { status: 400 }
    );
  }

  try {
    await verifyKey(sa);
    const row = { clientEmail: sa.clientEmail, privateKeyEnc: encryptToken(sa.privateKey) };
    await db.transaction(async (tx) => {
      await tx.delete(driveSettings);
      await tx.insert(driveSettings).values(row);
    });
    await writeAudit({
      actorUserId: auth.userId,
      eventType: "drive.key_saved",
      entityType: "drive_settings",
      entityId: sa.clientEmail,
      after: { clientEmail: sa.clientEmail },
    });
    return NextResponse.json({ ok: true, email: sa.clientEmail });
  } catch (err) {
    return errorResponse(err, "save key");
  }
}
