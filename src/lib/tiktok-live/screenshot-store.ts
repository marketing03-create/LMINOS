/**
 * Screenshot storage + audit persistence (Feature U2). At import time we keep
 * the raw image (Supabase Storage, private) and record exactly what Claude read
 * from it — the immutable paper trail HQ uses to catch a streamer who edits the
 * numbers after uploading. SERVER-ONLY (uses the service-role client).
 */
import { db } from "@/db/client";
import { tiktokScreenshotUploads } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  extractionToValues,
  type ScreenshotExtraction,
} from "./screenshot-extract-core";
import type { UploadedImage } from "./screenshot-extract";

export const SCREENSHOT_BUCKET = "tiktok-screenshots";

function extFor(mediaType: string | undefined): string {
  if (!mediaType) return "bin";
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("webp")) return "webp";
  if (mediaType.includes("jpeg") || mediaType.includes("jpg")) return "jpg";
  return "img";
}

/**
 * Upload each image to private storage and insert one audit row per image with
 * its AI-read values. Best-effort: a storage/DB hiccup must NOT block the read,
 * so failures are swallowed (the review still returns). Returns how many stored.
 */
export async function storeUploadedScreenshots(args: {
  images: UploadedImage[];
  extractions: ScreenshotExtraction[];
  uploaderUserId: string | null;
}): Promise<number> {
  const { images, extractions, uploaderUserId } = args;
  const supabase = createSupabaseAdminClient();
  let stored = 0;

  await Promise.all(
    images.map(async (img, i) => {
      const e = extractions[i];
      if (!e) return;
      try {
        const path = `${uploaderUserId ?? "unknown"}/${crypto.randomUUID()}.${extFor(
          img.mediaType
        )}`;
        const { error: upErr } = await supabase.storage
          .from(SCREENSHOT_BUCKET)
          .upload(path, img.bytes, {
            contentType: img.mediaType || "image/png",
            upsert: false,
          });
        if (upErr) return; // storage failed — skip this one, don't block the read

        await db.insert(tiktokScreenshotUploads).values({
          uploaderUserId,
          storagePath: path,
          mediaType: img.mediaType,
          aiReadValues: extractionToValues(e) as Record<string, number>,
          detectedDate: e.date,
          detectedHandle: e.handle,
          detectedTab: e.tab,
        });
        stored += 1;
      } catch {
        // best-effort audit — never break the importer over a storage error
      }
    })
  );

  return stored;
}

/** Batch time-limited signed URLs for a set of storage paths (admin viewing). */
export async function signScreenshotUrls(
  paths: string[],
  expiresInSeconds = 3600
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) out.set(item.path, item.signedUrl);
  }
  return out;
}

/** Ensure the private bucket exists (one-time setup helper). */
export async function ensureScreenshotBucket(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.storage.getBucket(SCREENSHOT_BUCKET);
  if (data) return;
  await supabase.storage.createBucket(SCREENSHOT_BUCKET, { public: false });
}
