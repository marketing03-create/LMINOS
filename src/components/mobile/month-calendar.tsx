"use client";

import { useState } from "react";

const MYT_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * `YYYY-MM-DD` for an instant, in Malaysia time. Pinned rather than the
 * reader's zone because these forms render on the server (UTC) first: a 1am
 * live would otherwise sit on yesterday in the HTML and today after hydration.
 */
export function dayKey(d: Date): string {
  return MYT_DAY.format(d);
}

/** A grid cell's `YYYY-MM-DD`, built from its numbers without any time zone. */
function cellKey(year: number, month: number, day: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month + 1)}-${p(day)}`;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * A month grid for picking a day. Days carrying a mark get a dot under the
 * number — amber for "owed" (a live there still needs numbers), green for
 * "done" — so the calendar doubles as a map of what is left to fill in. Weeks
 * start on Monday; days after `max` can't be picked. 44px cells on a phone.
 */
export function MonthCalendar({
  value,
  onChange,
  marks,
  max,
}: {
  value: string;
  onChange: (key: string) => void;
  marks: Record<string, "owed" | "done">;
  /** Last pickable day, `YYYY-MM-DD`. */
  max?: string;
}) {
  const [month, setMonth] = useState(() => {
    const [y, mo] = (value || dayKey(new Date())).split("-").map(Number);
    return new Date(y, mo - 1, 1);
  });

  const year = month.getFullYear();
  const m = month.getMonth();
  const lead = (new Date(year, m, 1).getDay() + 6) % 7; // Monday-first offset
  const days = new Date(year, m + 1, 0).getDate();
  const today = dayKey(new Date());
  const maxMonth = max ? max.slice(0, 7) : null;
  const thisMonth = `${year}-${String(m + 1).padStart(2, "0")}`;

  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => cellKey(year, m, i + 1)),
  ];

  const shift = (n: number) => setMonth(new Date(year, m + n, 1));
  const nav =
    "flex h-11 w-11 items-center justify-center rounded-lg text-zinc-600 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30 lg:h-9 lg:w-9 lg:hover:bg-zinc-100 dark:text-zinc-300 dark:active:bg-zinc-800 lg:dark:hover:bg-zinc-800";

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className={nav}>
          <Chevron dir="left" />
        </button>
        <div className="text-[15px] font-semibold" aria-live="polite">
          {month.toLocaleString("en-MY", { month: "long", year: "numeric" })}
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={!!maxMonth && thisMonth >= maxMonth}
          aria-label="Next month"
          className={nav}
        >
          <Chevron dir="right" />
        </button>
      </div>

      <div role="grid" className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} role="columnheader" className="py-1 text-xs font-medium text-zinc-400">
            {w}
          </div>
        ))}
        {cells.map((key, i) => {
          if (!key) return <div key={`b${i}`} />;
          const on = key === value;
          const mark = marks[key];
          const future = !!max && key > max;
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-selected={on}
              aria-label={`${new Date(`${key}T00:00:00`).toLocaleDateString("en-MY", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}${mark === "owed" ? ", needs numbers" : mark === "done" ? ", complete" : ""}`}
              disabled={future}
              onClick={() => onChange(key)}
              className={`relative mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-full text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30 lg:h-10 lg:w-10 ${
                on
                  ? "bg-blue-600 font-semibold text-white"
                  : key === today
                    ? "font-semibold text-blue-600 ring-1 ring-inset ring-blue-300 active:bg-zinc-100 dark:text-blue-400 dark:ring-blue-800 dark:active:bg-zinc-800"
                    : "text-zinc-800 active:bg-zinc-100 lg:hover:bg-zinc-100 dark:text-zinc-200 dark:active:bg-zinc-800 lg:dark:hover:bg-zinc-800"
              }`}
            >
              {Number(key.slice(8))}
              {mark && (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${
                    on ? "bg-white" : mark === "owed" ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Needs numbers
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Complete
        </span>
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}
