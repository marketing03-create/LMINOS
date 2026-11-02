/** The key for the white / yellow number colours (lib/tiktok-live/entry-source.ts). */
export function SourceLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 ${className}`}>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-zinc-900 ring-1 ring-zinc-300 dark:bg-white dark:ring-zinc-600" />
        Fly.io (auto)
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-amber-600 dark:bg-yellow-300" />
        Keyed in / screenshot
      </span>
    </div>
  );
}
