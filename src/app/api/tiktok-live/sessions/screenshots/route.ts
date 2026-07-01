import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { serverEnv } from "@/lib/env";
import { buildReviewPayload } from "@/lib/tiktok-live/import-screenshots";
import type { UploadedImage } from "@/lib/tiktok-live/screenshot-extract";

// Claude vision per image; allow time for a few uploads.
export const maxDuration = 120;

/**
 * Read uploaded TikTok LIVE screenshots with Claude vision, group them by live,
 * and match each to an existing session BY DATE — returning a review payload.
 * Admin auth. NO DB write (the apply-screenshot route does that after the admin
 * confirms). Dark (503) until AI_GATEWAY_API_KEY is set.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  if (!serverEnv().AI_GATEWAY_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "AI is not configured. Add AI_GATEWAY_API_KEY (Vercel AI Gateway) to enable screenshot import.",
      },
      { status: 503 }
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, error: "invalid form" }, { status: 400 });
  }
  const files = form
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.type.startsWith("image/"));
  if (files.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Upload at least one image." },
      { status: 400 }
    );
  }

  const images: UploadedImage[] = await Promise.all(
    files.map(async (f) => ({
      bytes: new Uint8Array(await f.arrayBuffer()),
      mediaType: f.type,
    }))
  );

  try {
    const payload = await buildReviewPayload(images);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
