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

/** A UTC Date → its month+day (MM-DD) in Malaysia time. */
function mytMonthDay(d: Date): string {
  return mytDateStr(d).slice(5);
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
    // Prefer an exact full-date match; if none, fall back to the same month+day
    // regardless of YEAR. TikTok's LIVE analytics rarely shows the year, so the
    // AI's inferred year is unreliable (e.g. it reads "24 Jun" as 2024 when the
    // live was 2026) — month+day+handle+time still identifies the live uniquely.
    const monthDay = g.date.slice(5);
    let pool = input.sessions.filter(
      (s) => s.startedAt && mytDateStr(s.startedAt) === g.date
    );
    if (pool.length === 0) {
      pool = input.sessions.filter(
        (s) => s.startedAt && mytMonthDay(s.startedAt) === monthDay
      );
    }
    const targetMin = g.startTime ? hhmmToMinutes(g.startTime) : null;
    const ranked = [...pool].sort((a, b) => {
      // Same handle first.
      const ha = g.handle && a.handle === g.handle ? 0 : 1;
      const hb = g.handle && b.handle === g.handle ? 0 : 1;
      if (ha !== hb) return ha - hb;
      // Then closest start time.
      if (targetMin != null && a.startedAt && b.startedAt) {
        const da = Math.abs(mytMinutes(a.startedAt) - targetMin);
        const db = Math.abs(mytMinutes(b.startedAt) - targetMin);
        if (da !== db) return da - db;
      }
      // Finally the most recent live (best guess when several months+days match
      // across years — screenshots are almost always of a recent live).
      return (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0);
    });
    return {
      key: g.key,
      bestMatchSessionId: ranked[0]?.sessionId ?? null,
      candidateIds: ranked.map((s) => s.sessionId),
    };
  });
}
