import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/auth/authorize";
import { serverEnv } from "@/lib/env";
import { buildReviewFromExtractions } from "@/lib/tiktok-live/import-screenshots";
import { streamerAccountIds } from "@/lib/tiktok-live/queries";
import {
  extractFromImages,
  type UploadedImage,
} from "@/lib/tiktok-live/screenshot-extract";
import { storeUploadedScreenshots } from "@/lib/tiktok-live/screenshot-store";

// Claude vision per image; allow time for a few uploads.
export const maxDuration = 120;

/**
 * Read uploaded TikTok LIVE screenshots with Claude vision, group them by live,
 * and match each to an existing session BY DATE — returning a review payload.
 * Admin auth. NO DB write (the apply-screenshot route does that after the admin
 * confirms). Dark (503) until AI_GATEWAY_API_KEY is set.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole([...ADMIN_ROLES, "live_streamer"]);
  if (!auth.ok) return new NextResponse(auth.error, { status: auth.status });

  // Streamers only ever match against their own handles' sessions.
  const scope =
    auth.role === "live_streamer" && auth.userId
      ? await streamerAccountIds(auth.userId)
      : undefined;

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
    const extractions = await extractFromImages(images);
    // Persist the raw images + what Claude read, BEFORE the admin can edit —
    // the anti-fraud audit trail (best-effort, never blocks the read).
    await storeUploadedScreenshots({
      images,
      extractions,
      uploaderUserId: auth.userId ?? null,
    });
    const payload = await buildReviewFromExtractions(extractions, scope);
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
