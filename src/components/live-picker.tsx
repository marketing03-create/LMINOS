"use client";

import { useEffect, useRef, useState } from "react";

export type PickableLive = {
  sessionId: string;
  startedAt: Date | string | null;
  handle: string;
  title?: string | null;
};

function fmtWhen(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-MY", { hour12: false });
}

/**
 * A friendly "pick a live" chooser to replace the raw <select> (whose native
 * mobile picker is cramped and has no close control). Opens a panel with a
 * header + close ✕, a search box, and large two-line rows (when · @handle ·
 * title). Closes on pick, ✕, outside-click, or Escape.
 */
export function LivePicker({
  lives,
  value,
  onChange,
  disabled,
  placeholder = "— pick a live —",
}: {
  lives: PickableLive[];
  value: string;
  onChange: (sessionId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = lives.find((l) => l.sessionId === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? lives.filter((l) =>
        `${fmtWhen(l.startedAt)} @${l.handle} ${l.title ?? ""}`.toLowerCase().includes(q)
      )
    : lives;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <span className={`truncate ${selected ? "" : "text-zinc-400"}`}>
          {selected
            ? `${fmtWhen(selected.startedAt)} · @${selected.handle}`
            : placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Pick a live
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {lives.length > 6 && (
            <div className="border-b border-zinc-200 p-2 dark:border-zinc-800">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search date or handle…"
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
          )}

          <ul className="max-h-[50vh] overflow-y-auto overscroll-contain">
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-zinc-500">
                No matching lives.
              </li>
            )}
            {filtered.map((l) => {
              const on = l.sessionId === value;
              return (
                <li key={l.sessionId}>
                  <button
                    type="button"
                    onClick={() => pick(l.sessionId)}
                    className={`flex w-full items-start gap-2 border-b border-zinc-100 px-3 py-3 text-left last:border-b-0 dark:border-zinc-900 ${
                      on
                        ? "bg-blue-50 dark:bg-blue-950/40"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <span className="mt-0.5 w-4 shrink-0 text-blue-600 dark:text-blue-400">
                      {on ? "✓" : ""}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium tabular-nums">
                        {fmtWhen(l.startedAt)}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        @{l.handle}
                        {l.title ? ` · ${l.title}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
