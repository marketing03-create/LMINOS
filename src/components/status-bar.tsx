/**
 * A full-width status line in the style of "Tracker is running normally":
 * a tinted bar with a bold one-line headline and a smaller detail line.
 *
 * With `children` it is a collapsible section (closed by default): the bar
 * answers "is anything wrong?" at a glance, and the detail — the per-account
 * list — is one tap away instead of filling the page. Native <details>, so it
 * opens without JavaScript and is keyboard/screen-reader friendly for free.
 */
export type StatusTone = "good" | "warn" | "bad" | "neutral";

const TONE: Record<StatusTone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  bad: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  neutral:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
};

export function StatusBar({
  tone,
  title,
  detail,
  children,
  className = "mb-4",
}: {
  tone: StatusTone;
  title: string;
  detail?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const head = (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold">{title}</span>
      {detail && <span className="mt-0.5 block text-xs opacity-90">{detail}</span>}
    </span>
  );

  if (!children) {
    return (
      <div className={`flex items-center rounded-lg border px-4 py-3 ${TONE[tone]} ${className}`}>
        {head}
      </div>
    );
  }

  return (
    <details className={`group overflow-hidden rounded-lg border ${TONE[tone]} ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
        {head}
        <span aria-hidden="true" className="shrink-0 text-xs opacity-70 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-current/10 bg-white px-4 py-3 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </div>
    </details>
  );
}
