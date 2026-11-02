/**
 * Pure "is today's daily trigger due?" check for the Fly worker. DB-free so
 * it's unit-testable.
 *
 * Due from `at` (Malaysia time) until `until` that same day, once per day. The
 * last run lives in the DB, not memory, because the worker restarts itself
 * every ~6h — an in-process flag would fire again after each restart. If the
 * worker is down through the whole window, that day is skipped rather than
 * buzzing streamers in the evening.
 */
const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST

/** YYYY-MM-DD and minutes-since-midnight, in Malaysia time. */
function myt(d: Date): { day: string; minutes: number } {
  const m = new Date(d.getTime() + MYT_MS);
  return {
    day: m.toISOString().slice(0, 10),
    minutes: m.getUTCHours() * 60 + m.getUTCMinutes(),
  };
}

/** "11:30" → 690. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function dailyTriggerDue(
  now: Date,
  lastRun: Date | null,
  at: string,
  until: string
): boolean {
  const n = myt(now);
  if (n.minutes < toMinutes(at) || n.minutes >= toMinutes(until)) return false;
  return !lastRun || myt(lastRun).day !== n.day;
}
