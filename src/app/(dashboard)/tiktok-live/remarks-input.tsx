"use client";

import { useState } from "react";

/**
 * Inline "Remarks" editor for one live session. The streamer (on their card
 * feed) or an admin (in the wide table) types a free-text note; it saves on blur
 * via the session PATCH route — the same route + ownership rules as the metric
 * edits, so a streamer can only write on their own lives. A tiny status hint
 * (saving / saved / retry) sits beside it. No save button to hunt for.
 */
export function RemarksInput({
  sessionId,
  initial,
  compact = false,
}: {
  sessionId: string;
  initial: string | null;
  /** compact = single-line input for the admin table; else a small textarea. */
  compact?: boolean;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function save() {
    const next = value.trim();
    if (next === saved.trim()) return; // nothing changed
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
      setSaved(next);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  const hint =
    status === "saving"
      ? "Saving…"
      : status === "done"
        ? "Saved ✓"
        : status === "error"
          ? "Not saved — tap to retry"
          : null;
  const hintCls =
    status === "error"
      ? "text-red-500"
      : status === "done"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-zinc-400";

  const shared =
    "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="min-w-[9rem]">
      {compact ? (
        <input
          type="text"
          value={value}
          placeholder="Add a note…"
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          disabled={status === "saving"}
          className={shared}
        />
      ) : (
        <textarea
          value={value}
          placeholder="Add a note about this live…"
          rows={2}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          disabled={status === "saving"}
          className={`${shared} resize-y`}
        />
      )}
      {hint && <div className={`mt-0.5 text-[10px] ${hintCls}`}>{hint}</div>}
    </div>
  );
}
