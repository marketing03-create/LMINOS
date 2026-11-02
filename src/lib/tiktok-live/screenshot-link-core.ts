/**
 * Pure picker for which of an uploader's recent, unlinked screenshot uploads
 * belong to the live they just applied numbers to. DB-free so it's unit-testable.
 *
 * Linking by time alone attached EVERY recent upload to whatever live was
 * applied next — a 29/10 screenshot ended up on the 31/10 live's audit history.
 * So: a dated upload links only when its day matches the live's day (Malaysia
 * time; month+day like the matcher, since the AI sometimes misreads the year),
 * and an undated one (e.g. the "congratulations" card) only when it came in the
 * same batch as a dated upload that links.
 */
import { mytDateStr } from "./match-session-core";

export type RecentUpload = {
  id: string;
  detectedDate: string | null; // YYYY-MM-DD as read off the screenshot
  createdAt: Date;
};

/** How close an undated upload must be to a matching dated one to count as the same batch. */
export const SAME_BATCH_MS = 2 * 60 * 1000;

export function uploadsForSession(
  uploads: readonly RecentUpload[],
  sessionStartedAt: Date | null
): string[] {
  if (!sessionStartedAt) return [];
  const day = mytDateStr(sessionStartedAt).slice(5);
  const dated = uploads.filter(
    (u) => u.detectedDate && u.detectedDate.slice(5) === day
  );
  const undated = uploads.filter(
    (u) =>
      !u.detectedDate &&
      dated.some(
        (d) => Math.abs(d.createdAt.getTime() - u.createdAt.getTime()) <= SAME_BATCH_MS
      )
  );
  return [...dated, ...undated].map((u) => u.id);
}
