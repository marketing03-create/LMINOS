"use client";

import { useRef, useState } from "react";

/**
 * Inline "Remarks" editor for one live session. The streamer (on their card
 * feed) or an admin (in the wide table) types a free-text note; it saves on blur
 * via the session PATCH route — the same route + ownership rules as the metric
 * edits, so a streamer can only write on their own lives. A tiny status hint
 * (saving / saved) sits beside it. No save button to hunt for.
 *
 * Two things changed when the streamer's Home stopped rendering this on every
 * card (their remarks now live on the live's own page, with a real Save):
 *
 * 1. The failure state said "Not saved — tap to retry" in 10px, and tapping
 *    retried nothing — the only thing that ever calls `save()` is a blur, so
 *    the sentence described a gesture that did not exist. It is a button now.
 *    Making the string true is the fix; deleting it would have left the one
 *    state that needs an affordance with none at all.
 * 2. `text-base sm:text-sm` on the field itself. iOS Safari zooms the viewport
 *    for any input under 16px, and this is a text field an admin uses from a
 *    phone — from `sm` up it is the 14px box the sessions table has always had.
 *
 * `withSave` adds the explicit 44px Save the live's own page asks for, WITHOUT
 * removing the blur save — a thumb leaving the box still commits. That makes a
 * double-fire the default case (tapping Save blurs the textarea first), so the
 * comparison and the in-flight guard both moved to refs: two PATCHes for one
 * note would be two `tiktok_live_session.manual_metrics` rows in the audit log
 * describing a single edit.
 */
export function RemarksInput({
  sessionId,
  initial,
  compact = false,
  withSave = false,
}: {
  sessionId: string;
  initial: string | null;
  /** compact = single-line input for the admin table; else a small textarea. */
  compact?: boolean;
  /** Render an explicit Save button beside the blur save (the live's own page). */
  withSave?: boolean;
}) {
  const [value, setValue] = useState(initial ?? "");
  const saved = useRef(initial ?? "");
  const inFlight = useRef(false);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function save() {
    const next = value.trim();
    // Blur fires before click, so Save-after-typing calls this twice with the
    // same text. Refs, not state: the second call runs before React has
    // re-rendered, and a stale `saved` would let a duplicate PATCH through.
    if (inFlight.current) return;
    if (next === saved.current.trim()) return; // nothing changed
    inFlight.current = true;
    setStatus("saving");
    try {
      const res = await fetch(`/api/tiktok-live/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ remarks: next === "" ? null : next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) {
        setStatus("error");
        return;
      }
      saved.current = next;
      setStatus("done");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }

  const hint = status === "saving" ? "Saving…" : status === "done" ? "Saved ✓" : null;
  const hintCls =
    status === "done" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400";

  /**
   * Spoken, not drawn. Two reasons it is a permanently-mounted `sr-only` span
   * rather than a `role="status"` on the visible hint:
   *
   * 1. A live region that is inserted into the DOM with its text already inside
   *    is unreliably announced — most screen readers only announce a MUTATION
   *    of a region that was already present. The hint mounts and unmounts, so a
   *    role on it announces nothing dependably.
   * 2. The failure state has no visible hint at all any more (it is the retry
   *    button), so without this a save that fails is completely silent to a
   *    screen reader: the field looks unchanged and a new button appears
   *    somewhere below with no announcement.
   *
   * `sr-only` is absolutely positioned and clipped, so mounting it always costs
   * zero layout — which matters because this component sits in a 22-column
   * admin table cell at `lg` and an always-present block would re-measure every
   * row (P5).
   */
  const announcement =
    status === "saving"
      ? "Saving note"
      : status === "done"
        ? "Note saved"
        : status === "error"
          ? "Note not saved. Use the retry button."
          : "";

  const shared =
    "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-base sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="min-w-[9rem]">
      {/* `aria-label`, because the only name this field has ever had is its
          placeholder. In the admin TABLE the "Remarks" column header supplies
          the context visually, but a placeholder is not a reliable accessible
          name and it vanishes the moment there is a note to read; on the mobile
          RecordCard and on the live's own page there is no header at all, so
          the box announces as an unlabelled edit field. */}
      {compact ? (
        <input
          type="text"
          value={value}
          aria-label="Remarks"
          placeholder="Add a note…"
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          disabled={status === "saving"}
          className={shared}
        />
      ) : (
        <textarea
          value={value}
          aria-label="Remarks"
          placeholder="Add a note about this live…"
          rows={2}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          disabled={status === "saving"}
          className={`${shared} resize-y`}
        />
      )}
      {withSave && (
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800"
        >
          {status === "saving" ? "Saving…" : "Save note"}
        </button>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {hint && <div className={`mt-0.5 text-xs ${hintCls}`}>{hint}</div>}
      {status === "error" && (
        <button
          type="button"
          onClick={save}
          className="mt-1 inline-flex min-h-11 items-center rounded-md border border-red-300 px-3 text-sm font-medium text-red-600 active:bg-red-50 lg:min-h-0 lg:py-1 dark:border-red-900 dark:text-red-400 dark:active:bg-red-950/40"
        >
          Not saved — retry
        </button>
      )}
    </div>
  );
}
