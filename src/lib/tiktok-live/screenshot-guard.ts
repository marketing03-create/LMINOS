/**
 * Guards in front of the AI screenshot reader, which costs money per image.
 *
 * - Type: decided from the file's first bytes, never from what the browser
 *   claims — a renamed SVG/HTML file used to be stored as an "image".
 * - Quota: per person, counted from the uploads audit table (each read image
 *   is one row), so it needs no new storage. The limits sit far above real
 *   use — the busiest day on record is 21 images for one person — and only
 *   stop a script or a stuck loop from running up the AI bill.
 */
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { tiktokScreenshotUploads } from "@/db/schema";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const QUOTA_PER_HOUR = 60;
export const QUOTA_PER_DAY = 150;

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

/** The real image type from its magic bytes, or null if it isn't PNG/JPEG/WebP. */
export function detectImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  return null;
}

/** null when `incoming` more images are allowed now; otherwise a message for the person. */
export async function screenshotQuotaError(userId: string, incoming: number): Promise<string | null> {
  const now = Date.now();
  const since = (ms: number) =>
    db
      .select({ n: count() })
      .from(tiktokScreenshotUploads)
      .where(
        and(
          eq(tiktokScreenshotUploads.uploaderUserId, userId),
          gte(tiktokScreenshotUploads.createdAt, new Date(now - ms))
        )
      );
  const [[hour], [day]] = await Promise.all([since(3_600_000), since(86_400_000)]);
  if (Number(hour?.n ?? 0) + incoming > QUOTA_PER_HOUR) {
    return "You've read a lot of screenshots in the last hour. Please wait a bit, or type the numbers in.";
  }
  if (Number(day?.n ?? 0) + incoming > QUOTA_PER_DAY) {
    return "You've reached today's screenshot limit. Please type the numbers in, or try again tomorrow.";
  }
  return null;
}
