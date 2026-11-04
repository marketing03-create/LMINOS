import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireCustomerRole, scopeFor } from "@/lib/drive/api";
import { recountStale } from "@/lib/drive/customers";

/**
 * Re-count the documents in the customers on screen — the caller's own handles
 * only — when they weren't checked in the last minute. The Customers list calls
 * this as it opens, so ticks follow uploads without anyone pressing anything.
 *
 * Body: { sessionId? } → { ok, checked }
 */
export async function POST(request: NextRequest) {
  const auth = await requireCustomerRole();
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
  const sessionId =
    typeof body?.sessionId === "string" && /^[0-9a-f-]{36}$/i.test(body.sessionId) ? body.sessionId : undefined;

  try {
    const checked = await recountStale({
      accountIds: await scopeFor(auth),
      sessionId,
      olderThanMs: 60_000,
      limit: 60,
    });
    return NextResponse.json({ ok: true, checked });
  } catch (err) {
    return errorResponse(err, "recount");
  }
}
