/**
 * The Integrations page's building blocks, so every section looks the same:
 * a section header (title + one action), flat panels, status pills, stats.
 * No "use client" — server and client parts both use these.
 */

export type Tone = "ok" | "warn" | "bad" | "off";

const PILL: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20",
  warn: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20",
  bad: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-400/20",
  off: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20",
};
const DOT: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  off: "bg-zinc-400",
};

export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PILL[tone]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

export function Section({
  id,
  title,
  meta,
  action,
  children,
}: {
  id: string;
  title: string;
  /** Small text after the title, e.g. "2 accounts". */
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 lg:scroll-mt-6">
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <h2 id={`${id}-h`} className="flex items-baseline gap-2 text-base font-semibold tracking-tight lg:text-lg">
          {title}
          {meta && <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">{meta}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950 ${className}`}
    >
      {children}
    </div>
  );
}

/** Small uppercase label above a group inside a panel. */
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "warn" | "accent";
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div
        className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${
          tone === "warn"
            ? "text-amber-700 dark:text-amber-400"
            : tone === "accent"
              ? "text-indigo-600 dark:text-indigo-400"
              : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export const btn = {
  primary:
    "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 lg:h-9",
  secondary:
    "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-800 lg:h-9",
  danger:
    "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 active:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40 lg:h-9",
  icon:
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:h-9 lg:w-9",
};

export const field =
  "h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 placeholder:text-zinc-400 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 lg:h-9 lg:text-sm";
