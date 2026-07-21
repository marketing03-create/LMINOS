/**
 * Screenshot audit history (Feature U2). Lists uploaded TikTok LIVE screenshots
 * newest-first with: who uploaded, when, what Claude read, and — if the upload
 * was applied to a session — that session's CURRENT saved values, so HQ can spot
 * numbers a streamer edited after uploading. SERVER-ONLY.
 */
import { desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  tiktokAccounts,
  tiktokLiveSessions,
  tiktokScreenshotUploads,
  users,
} from "@/db/schema";

export type ScreenshotHistoryRow = {
  id: string;
  createdAt: Date;
  storagePath: string;
  aiReadValues: Record<string, number> | null;
  detectedDate: string | null;
  detectedHandle: string | null;
  detectedTab: string | null;
  uploaderEmail: string | null;
  appliedSessionId: string | null;
  sessionHandle: string | null;
  sessionStartedAt: Date | null;
  sessionValues: Record<string, number | null> | null;
};

export async function listScreenshotUploads(
  limit = 200,
  handle?: string
): Promise<ScreenshotHistoryRow[]> {
  // Optionally scope to one streamer's handle — matching either what the AI read
  // off the image (detectedHandle) or the applied session's account handle.
  const h = handle?.trim().toLowerCase();
  const handleFilter = h
    ? or(
        sql`lower(${tiktokScreenshotUploads.detectedHandle}) = ${h}`,
        sql`lower(${tiktokAccounts.handle}) = ${h}`
      )
    : undefined;

  const rows = await db
    .select({
      id: tiktokScreenshotUploads.id,
      createdAt: tiktokScreenshotUploads.createdAt,
      storagePath: tiktokScreenshotUploads.storagePath,
      aiReadValues: tiktokScreenshotUploads.aiReadValues,
      detectedDate: tiktokScreenshotUploads.detectedDate,
      detectedHandle: tiktokScreenshotUploads.detectedHandle,
      detectedTab: tiktokScreenshotUploads.detectedTab,
      uploaderEmail: users.email,
      appliedSessionId: tiktokScreenshotUploads.appliedSessionId,
      sessionHandle: tiktokAccounts.handle,
      sessionStartedAt: tiktokLiveSessions.startedAt,
      sTotalViews: tiktokLiveSessions.totalViews,
      sPeakViewers: tiktokLiveSessions.peakViewers,
      sAvgViewers: tiktokLiveSessions.avgViewers,
      sTotalLikes: tiktokLiveSessions.totalLikes,
      sTotalComments: tiktokLiveSessions.totalComments,
      sTotalShares: tiktokLiveSessions.totalShares,
      sNewFollowers: tiktokLiveSessions.newFollowers,
      sUniqueViewers: tiktokLiveSessions.uniqueViewers,
      sActiveViewers: tiktokLiveSessions.activeViewers,
      sAvgWatchSeconds: tiktokLiveSessions.avgWatchSeconds,
      sDirectMessages: tiktokLiveSessions.directMessages,
      sServiceBioViews: tiktokLiveSessions.serviceBioViews,
      sInterestedViewers: tiktokLiveSessions.interestedViewers,
      sDiamonds: tiktokLiveSessions.diamonds,
    })
    .from(tiktokScreenshotUploads)
    .leftJoin(users, eq(users.id, tiktokScreenshotUploads.uploaderUserId))
    .leftJoin(
      tiktokLiveSessions,
      eq(tiktokLiveSessions.id, tiktokScreenshotUploads.appliedSessionId)
    )
    .leftJoin(
      tiktokAccounts,
      eq(tiktokAccounts.id, tiktokLiveSessions.accountId)
    )
    .where(handleFilter)
    .orderBy(desc(tiktokScreenshotUploads.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    storagePath: r.storagePath,
    aiReadValues: r.aiReadValues,
    detectedDate: r.detectedDate,
    detectedHandle: r.detectedHandle,
    detectedTab: r.detectedTab,
    uploaderEmail: r.uploaderEmail,
    appliedSessionId: r.appliedSessionId,
    sessionHandle: r.sessionHandle,
    sessionStartedAt: r.sessionStartedAt,
    sessionValues: r.appliedSessionId
      ? {
          totalViews: r.sTotalViews,
          peakViewers: r.sPeakViewers,
          avgViewers: r.sAvgViewers,
          totalLikes: r.sTotalLikes,
          totalComments: r.sTotalComments,
          totalShares: r.sTotalShares,
          newFollowers: r.sNewFollowers,
          uniqueViewers: r.sUniqueViewers,
          activeViewers: r.sActiveViewers,
          avgWatchSeconds: r.sAvgWatchSeconds,
          directMessages: r.sDirectMessages,
          serviceBioViews: r.sServiceBioViews,
          interestedViewers: r.sInterestedViewers,
          diamonds: r.sDiamonds,
        }
      : null,
  }));
}
