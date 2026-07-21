import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { users } from "./users";
import { tiktokLiveSessions } from "./tiktok-live-sessions";

/**
 * Anti-fraud audit trail (Feature U2): one row per TikTok LIVE screenshot the
 * streamer/admin uploads to the importer. Stores the raw image (Supabase
 * Storage `storagePath`) + exactly what Claude READ from it at upload time
 * (`aiReadValues`, immutable) + who/when. HQ can then compare the original
 * screenshot to the numbers currently saved on the live and catch fake edits —
 * a live streamer can still edit metrics after uploading, so this is the paper
 * trail. `appliedSessionId` is best-effort linked when the upload is applied.
 */
export const tiktokScreenshotUploads = pgTable(
  "tiktok_screenshot_uploads",
  {
    id: id(),
    uploaderUserId: uuid("uploader_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    storagePath: text("storage_path").notNull(),
    mediaType: text("media_type"),
    // The DB-column values Claude read off THIS image (rounded ints), immutable.
    aiReadValues: jsonb("ai_read_values").$type<Record<string, number>>(),
    detectedDate: text("detected_date"),
    detectedHandle: text("detected_handle"),
    detectedTab: text("detected_tab"),
    appliedSessionId: uuid("applied_session_id").references(
      () => tiktokLiveSessions.id,
      { onDelete: "set null" }
    ),
    ...timestamps(),
  },
  (t) => ({
    createdIdx: index("tiktok_screenshot_uploads_created_idx").on(t.createdAt),
    uploaderIdx: index("tiktok_screenshot_uploads_uploader_idx").on(
      t.uploaderUserId
    ),
  })
);
