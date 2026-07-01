/**
 * Pure date-matcher (Feature Q): given screenshot groups (with a date in
 * Malaysia time) and the existing TikTok live sessions (startedAt in UTC), find
 * the best-matching session per group + ranked candidates for the dropdown.
 * DB-free so it's unit-testable.
 */
export type MatchSession = {
  sessionId: string;
  accountId: string;
  handle: string;
  startedAt: Date | null;
  title: string | null;
};

export type MatchInputGroup = {
  key: string;
  date: string | null; // YYYY-MM-DD in Malaysia time
  handle: string | null;
  startTime: string | null; // HH:mm 24h, Malaysia time
};

export type MatchResult = {
  key: string;
  bestMatchSessionId: string | null;
  candidateIds: string[];
};

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** A UTC Date → its calendar date (YYYY-MM-DD) in Malaysia time. */
export function mytDateStr(d: Date): string {
  return new Date(d.getTime() + MYT_OFFSET_MS).toISOString().slice(0, 10);
}

function mytMinutes(d: Date): number {
  const m = new Date(d.getTime() + MYT_OFFSET_MS);
  return m.getUTCHours() * 60 + m.getUTCMinutes();
}

function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function matchSessions(input: {
  groups: MatchInputGroup[];
  sessions: MatchSession[];
}): MatchResult[] {
  return input.groups.map((g) => {
    // Undated screenshot → can't auto-match; offer all sessions for manual attach.
    if (!g.date) {
      return {
        key: g.key,
        bestMatchSessionId: null,
        candidateIds: input.sessions.map((s) => s.sessionId),
      };
    }
    const sameDay = input.sessions.filter(
      (s) => s.startedAt && mytDateStr(s.startedAt) === g.date
    );
    const targetMin = g.startTime ? hhmmToMinutes(g.startTime) : null;
    const ranked = [...sameDay].sort((a, b) => {
      // Same handle first.
      const ha = g.handle && a.handle === g.handle ? 0 : 1;
      const hb = g.handle && b.handle === g.handle ? 0 : 1;
      if (ha !== hb) return ha - hb;
      // Then closest start time.
      if (targetMin != null && a.startedAt && b.startedAt) {
        return (
          Math.abs(mytMinutes(a.startedAt) - targetMin) -
          Math.abs(mytMinutes(b.startedAt) - targetMin)
        );
      }
      return 0;
    });
    return {
      key: g.key,
      bestMatchSessionId: ranked[0]?.sessionId ?? null,
      candidateIds: ranked.map((s) => s.sessionId),
    };
  });
}
