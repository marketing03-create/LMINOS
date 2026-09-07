"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * "Add your live screenshot" — the fast path, ON the session page itself.
 *
 * A streamer opening one of their lives (auto-recorded by the connector) used to
 * have to leave for /tiktok-live/import, upload there, and let the matcher guess
 * which live the photos belonged to. Here the live is already known, so the
 * match step disappears: read the photos, check the numbers, save to THIS
 * session.
 *
 * Two rules this card sticks to, both to keep a live system safe:
 *
 * 1. IT ONLY FILLS, NEVER CLEARS. Only non-empty values are sent, so a metric
 *    the screenshot didn't show keeps whatever is already stored. Clearing a
 *    number stays the metrics card's job below.
 * 2. IT KEEPS THE AUDIT TRAIL HONEST. What the AI read is sent alongside what
 *    the streamer saved (`screenshotValues`), so the apply route can still flag
 *    a hand-edited figure for admin review.
 */

// Same wording the importer and the manual form use, so a streamer sees one
// name per number wherever they enter it.
const LABELS: Record<string, string> = {
  totalViews: "Views",
  peakViewers: "Peak viewers",
  avgViewers: "Avg viewers",
  totalLikes: "Likes",
  totalComments: "Comments",
  totalShares: "Shares",
  newFollowers: "New followers",
  uniqueViewers: "Unique viewers",
  activeViewers: "Active viewers",
  avgWatchSeconds: "Avg watch (sec)",
  directMessages: "Direct messages",
  serviceBioViews: "Service bio views",
  interestedViewers: "Interested viewers",
  diamonds: "Diamonds",
};

type ReadGroup = {
  date: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  values: Record<string, number>;
  conflicts?: string[];
};

export function SessionScreenshotCard({
  sessionId,
  aiConfigured,
  sessionDate,
  current,
}: {
  sessionId: string;
  /** Screenshot reading needs AI_GATEWAY_API_KEY; without it the card stays dark. */
  aiConfigured: boolean;
  /** This live's date (YYYY-MM-DD, Malaysia time) — to warn on a mismatched photo. */
  sessionDate: string | null;
  /** Current stored values, so each row can read "now 1,234 → 1,240". */
  current: Record<string, number | null>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [group, setGroup] = useState<ReadGroup | null>(null);
  // What the AI actually read, frozen — the streamer edits `vals`, not this.
  const [readValues, setReadValues] = useState<Record<string, number>>({});
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setFiles([]);
    setGroup(null);
    setReadValues({});
    setVals({});
    setMsg(null);
    setErr(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function readScreenshots() {
    if (!files.length) return;
    setReading(true);
    setErr(null);
    setMsg(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("images", f));
      const res = await fetch("/api/tiktok-live/sessions/screenshots", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Couldn't read the screenshots (${res.status}).`);
        return;
      }
      const groups = (json.groups ?? []) as ReadGroup[];
      // The live is already known, so matching is irrelevant — take the group
      // that actually carries numbers.
      const g =
        groups.find((x) => Object.keys(x.values ?? {}).length > 0) ?? groups[0];
      if (!g || Object.keys(g.values ?? {}).length === 0) {
        setErr("No numbers could be read from those images. Try a clearer screenshot.");
        return;
      }
      setGroup(g);
      setReadValues(g.values);
      setVals(
        Object.fromEntries(Object.entries(g.values).map(([k, v]) => [k, String(v)]))
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  async function apply() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    // Only non-empty values travel — a blank must never wipe a stored number.
    const values: Record<string, number> = {};
    for (const [k, raw] of Object.entries(vals)) {
      const t = raw.trim();
      if (t === "") continue;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        setErr(`${LABELS[k] ?? k}: use a number of 0 or more.`);
        setBusy(false);
        return;
      }
      values[k] = Math.round(n);
    }
    if (Object.keys(values).length === 0) {
      setErr("Nothing to save — every number is blank.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/tiktok-live/sessions/${sessionId}/apply-screenshot`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values, screenshotValues: readValues }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Failed to save (${res.status}).`);
        return;
      }
      setMsg("Saved to this live.");
      setGroup(null);
      setFiles([]);
      setReadValues({});
      setVals({});
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // A photo dated differently from this live is the one mistake worth catching
  // before it overwrites good numbers — warn, but let them proceed.
  const dateMismatch =
    group?.date && sessionDate && group.date !== sessionDate ? group.date : null;

  const readKeys = Object.keys(vals).filter((k) => k in LABELS);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Add your live screenshot
        </h2>
        <span className="text-[11px] text-zinc-400">
          Reads the numbers for you — no typing.
        </span>
      </div>

      {!aiConfigured ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Automatic screenshot reading is <b>OFF</b> right now — type your numbers
          into <b>Session metrics</b> below instead. It saves exactly the same way.
        </div>
      ) : (
        <>
          {err && (
            <div className="my-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {err}
            </div>
          )}

          {!group && (
            <div className="mt-3">
              {/* Big tap target: on a phone this opens Camera / Photo Library. */}
              <label
                htmlFor={`shots-${sessionId}`}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-8 text-center transition-colors active:bg-zinc-50 dark:border-zinc-700 dark:active:bg-zinc-900"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-zinc-400"
                  aria-hidden="true"
                >
                  <path d="M14.5 4h-5L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-3l-2.5-3Z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {files.length
                    ? `${files.length} photo${files.length === 1 ? "" : "s"} selected`
                    : "Take or choose screenshots"}
                </span>
                <span className="text-xs text-zinc-500">
                  Your TikTok LIVE analytics screens — add as many as you have.
                </span>
              </label>
              <input
                id={`shots-${sessionId}`}
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  setFiles(Array.from(e.target.files ?? []));
                  setErr(null);
                  setMsg(null);
                }}
              />

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={readScreenshots}
                  disabled={!files.length || reading}
                  className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
                >
                  {reading ? "Reading…" : "Read screenshots"}
                </button>
                {files.length > 0 && !reading && (
                  <button
                    type="button"
                    onClick={reset}
                    className="text-sm text-zinc-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              {msg && (
                <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">{msg}</p>
              )}
            </div>
          )}

          {group && (
            <div className="mt-3">
              {dateMismatch && (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  These screenshots look like <b>{dateMismatch}</b>, but this live
                  is <b>{sessionDate}</b>. Check you picked the right live before
                  saving.
                </div>
              )}

              <p className="mb-2 text-xs text-zinc-500">
                Read from your {files.length} photo{files.length === 1 ? "" : "s"} —
                check each number, then save.
              </p>

              <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {readKeys.map((k) => (
                  <label key={k} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-700 dark:text-zinc-200">
                        {LABELS[k]}
                      </span>
                      <span className="block text-[11px] text-zinc-400">
                        now {current[k] == null ? "—" : current[k]?.toLocaleString("en-MY")}
                      </span>
                    </span>
                    <input
                      inputMode="numeric"
                      value={vals[k] ?? ""}
                      onChange={(e) =>
                        setVals((p) => ({ ...p, [k]: e.target.value }))
                      }
                      disabled={busy}
                      placeholder="—"
                      className="w-28 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>
                ))}
              </div>

              <p className="mt-3 text-[11px] text-zinc-400">
                Total Leads and Filtered Leads aren&apos;t on a TikTok screenshot —
                add those in <b>Session metrics</b> below.
              </p>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={apply}
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 sm:w-auto"
                >
                  {busy ? "Saving…" : "Save to this live"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy}
                  className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
