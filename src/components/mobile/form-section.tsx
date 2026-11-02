"use client";

/**
 * One numbered section of a data-entry form: a card with a step number, a
 * title, and a progress pill ("2 / 4") that turns green when every box in it is
 * filled. `collapsible` sections fold to their header, so a long form reads as
 * a short checklist; the pill still shows what is inside. Unlike `Disclosure`,
 * it stays collapsible at every width — the form is the same on a desktop.
 */
export function FormSection({
  step,
  title,
  filled,
  total,
  required = false,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  step: number;
  title: string;
  /** Boxes filled in this section; omit (with `total`) for no pill. */
  filled?: number;
  total?: number;
  /** Amber pill while incomplete: these numbers are chased. */
  required?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const hasPill = filled != null && total != null && total > 0;
  const done = hasPill && filled >= total;
  const pill = hasPill ? (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
        done
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
          : required
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {done ? "✓ " : ""}
      {filled} / {total}
    </span>
  ) : null;

  const header = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
          done
            ? "bg-emerald-600 text-white"
            : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        }`}
      >
        {step}
      </span>
      <h2 className="min-w-0 flex-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
        {required && <span className="sr-only"> (required)</span>}
      </h2>
      {pill}
    </>
  );

  const card =
    "rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

  if (!collapsible) {
    return (
      <section className={card}>
        <div className="flex min-h-14 items-center gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          {header}
        </div>
        <div className="p-4">{children}</div>
      </section>
    );
  }

  return (
    <details open={defaultOpen} className={`group ${card}`}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:bg-zinc-50 group-open:rounded-b-none group-open:border-b group-open:border-zinc-100 dark:active:bg-zinc-800/60 dark:group-open:border-zinc-800 [&::-webkit-details-marker]:hidden">
        {header}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-zinc-400 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}
