/**
 * TikTok screenshot → metrics, via Claude vision (Feature Q). Sends each uploaded
 * image to Claude through the Vercel AI Gateway and gets back the structured
 * extraction. Mirrors src/lib/ai/ads-analyst.ts (model resolution + AI key
 * guard). Pure schema/merge/prompt live in screenshot-extract-core.ts.
 */
import { generateObject } from "ai";
import { serverEnv } from "@/lib/env";
import {
  buildScreenshotPrompt,
  DEFAULT_SCREENSHOT_MODEL,
  SCREENSHOT_SYSTEM,
  ScreenshotExtractionSchema,
  type ScreenshotExtraction,
} from "./screenshot-extract-core";

export const MAX_SCREENSHOTS = 12;

export type UploadedImage = { bytes: Uint8Array; mediaType: string };

function requireKey() {
  const env = serverEnv();
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "AI is not configured. Add AI_GATEWAY_API_KEY (Vercel AI Gateway) to enable screenshot import."
    );
  }
  return env;
}

export async function extractOneImage(
  img: UploadedImage
): Promise<ScreenshotExtraction> {
  const env = requireKey();
  // Dedicated fast model for screenshot OCR — independent of the ads analyst so
  // that stays on Opus while this stays fast. Images already read in parallel.
  const model = env.SCREENSHOT_MODEL ?? DEFAULT_SCREENSHOT_MODEL;
  const { object } = await generateObject({
    model,
    schema: ScreenshotExtractionSchema,
    system: SCREENSHOT_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildScreenshotPrompt() },
          { type: "image", image: img.bytes, mediaType: img.mediaType },
        ],
      },
    ],
    // The output is a tiny JSON (~15 fields) — a smaller cap finishes sooner.
    maxOutputTokens: 1024,
  });
  return object;
}

/** Extract every uploaded image (capped), in parallel. */
export async function extractFromImages(
  images: UploadedImage[]
): Promise<ScreenshotExtraction[]> {
  requireKey();
  return Promise.all(images.slice(0, MAX_SCREENSHOTS).map(extractOneImage));
}
