/**
 * Screenshot-import orchestrator (Feature Q): uploaded images → Claude vision →
 * merged-by-live groups → matched to existing sessions by date → a review
 * payload the importer UI renders (no DB write happens here).
 */
import {
  extractFromImages,
  type UploadedImage,
} from "./screenshot-extract";
import {
  mergeExtractions,
  type MergedGroup,
  type ScreenshotExtraction,
} from "./screenshot-extract-core";
import { matchSessions, type MatchSession } from "./match-session-core";
import { sessionsForMatching, tiktokAccountsForPicker, type MatchCandidate } from "./queries";

export type ReviewGroup = MergedGroup & {
  bestMatchSessionId: string | null;
  candidateIds: string[];
};

export type ReviewPayload = {
  groups: ReviewGroup[];
  sessions: MatchCandidate[];
  /** Handles this person may add a NEW live to (a screenshot of a live that
   * isn't in TT Stars yet). A streamer gets only their own. */
  accounts: { id: string; handle: string }[];
};

/** Build the review payload from already-extracted images (lets the caller
 * persist the raw images + extractions for the audit trail in between). */
export async function buildReviewFromExtractions(
  extractions: ScreenshotExtraction[],
  accountIds?: string[]
): Promise<ReviewPayload> {
  const groups = mergeExtractions(extractions);

  // A live streamer only matches against their own handles' sessions.
  const candidates = await sessionsForMatching(500, accountIds);
  const accounts = (await tiktokAccountsForPicker(accountIds)).map((a) => ({ id: a.id, handle: a.handle }));
  const sessions: MatchSession[] = candidates.map((c) => ({
    sessionId: c.sessionId,
    accountId: c.accountId,
    handle: c.handle,
    startedAt: c.startedAt,
    title: c.title,
  }));

  const results = matchSessions({
    groups: groups.map((g) => ({
      key: g.key,
      date: g.date,
      handle: g.handle,
      startTime: g.startTime,
    })),
    sessions,
  });
  const byKey = new Map(results.map((r) => [r.key, r]));

  return {
    groups: groups.map((g) => {
      const r = byKey.get(g.key);
      return {
        ...g,
        bestMatchSessionId: r?.bestMatchSessionId ?? null,
        candidateIds: r?.candidateIds ?? [],
      };
    }),
    sessions: candidates,
    accounts,
  };
}

/** Convenience: extract images then build the review (no persistence). */
export async function buildReviewPayload(
  images: UploadedImage[],
  accountIds?: string[]
): Promise<ReviewPayload> {
  const extractions = await extractFromImages(images);
  return buildReviewFromExtractions(extractions, accountIds);
}
