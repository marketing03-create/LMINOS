import Link from "next/link";

export type ChooserOption = {
  accountId: string;
  handle: string;
  streamer: string | null;
  sessions: number;
  isActive: boolean;
};

/**
 * Centered "which streamer do you want to view?" chooser shown when an admin
 * opens TikTok Live — a login-page-style gate before the performance view. Each
 * choice links to that handle's full performance page (or the combined view).
 *
 * On a phone this is the *first* thing on the page and the whole reason an
 * admin opened it, so the rows are sized as real targets rather than as text
 * that happens to be clickable. `min-h-16` is a floor, not a change: a two-line
 * row already measures ~68px at `lg`, so nothing on a laptop moves.
 *
 * Two things that were here are gone. The instruction under the heading said
 * the same thing as the heading and as the page's own intro — three
 * restatements of "pick someone" above a list of people. And "paused" was set
 * at 11px in zinc-400, which is the one word on the row that changes what the
 * numbers behind it mean; a state chip may not be smaller or fainter than the
 * label it qualifies.
 */
export function StreamerChooser({ options }: { options: ChooserOption[] }) {
  return (
    <div className="my-8 flex justify-center">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm">
        <h2 className="mb-5 text-center text-lg font-semibold tracking-tight">
          Choose a live streamer
        </h2>
        <div className="space-y-2">
          <Link
            href="/admin/tiktok/all"
            className="block min-h-16 rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors hover:border-blue-400 hover:bg-blue-50/60 active:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 dark:active:bg-blue-950/30"
          >
            <div className="font-medium">All streamers</div>
            <div className="text-sm text-zinc-500">Combined</div>
          </Link>

          {options.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-6 text-center text-sm text-zinc-500">
              No handles registered yet — add one below.
            </div>
          ) : (
            options.map((o) => (
              <Link
                key={o.accountId}
                href={`/admin/tiktok/${o.accountId}`}
                className="block min-h-16 rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors hover:border-blue-400 hover:bg-blue-50/60 active:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 dark:active:bg-blue-950/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium">@{o.handle}</span>
                  {!o.isActive && (
                    <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
                      Paused
                    </span>
                  )}
                </div>
                <div className="text-sm text-zinc-500">
                  {o.streamer ?? "unassigned"} · {o.sessions}{" "}
                  {o.sessions === 1 ? "live" : "lives"}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
