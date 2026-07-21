/**
 * Instant feedback for every page navigation inside the dashboard: the
 * sidebar (layout) stays put and the page area shows this shimmer skeleton
 * the moment a link is clicked, while the server renders the real page.
 */
export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-6xl animate-pulse">
      <div className="h-7 w-56 rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-3 h-4 w-96 max-w-full rounded bg-zinc-200/70 dark:bg-zinc-800/70" />

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
          />
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        <div className="h-10 bg-zinc-50 dark:bg-zinc-900" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-11 border-t border-zinc-100 dark:border-zinc-900"
          >
            <div className="h-3.5 mt-4 mx-4 w-2/3 rounded bg-zinc-100 dark:bg-zinc-900" />
          </div>
        ))}
      </div>
    </div>
  );
}
