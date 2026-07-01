/**
 * Screenshot-import orchestrator (Feature Q): uploaded images → Claude vision →
 * merged-by-live groups → matched to existing sessions by date → a review
 * payload the importer UI renders (no DB write happens here).
 */
import { extractFromImages, type UploadedImage } from "./screenshot-extract";
import { mergeExtractions, type MergedGroup } from "./screenshot-extract-core";
import { matchSessions, type MatchSession } from "./match-session-core";
import { sessionsForMatching, type MatchCandidate } from "./queries";

export type ReviewGroup = MergedGroup & {
  bestMatchSessionId: string | null;
  candidateIds: string[];
};

export type ReviewPayload = {
  groups: ReviewGroup[];
  sessions: MatchCandidate[];
};

export async function buildReviewPayload(
  images: UploadedImage[]
): Promise<ReviewPayload> {
  const extractions = await extractFromImages(images);
  const groups = mergeExtractions(extractions);

  const candidates = await sessionsForMatching();
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
  };
}
