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
 */
export function StreamerChooser({ options }: { options: ChooserOption[] }) {
  return (
    <div className="my-8 flex justify-center">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm">
        <h2 className="text-center text-lg font-semibold tracking-tight">
          Choose a live streamer
        </h2>
        <p className="mt-1 mb-5 text-center text-sm text-zinc-500">
          Pick whose live results you want to view.
        </p>
        <div className="space-y-2">
          <Link
            href="/admin/tiktok/all"
            className="block rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors hover:border-blue-400 hover:bg-blue-50/60 dark:hover:border-blue-700 dark:hover:bg-blue-950/20"
          >
            <div className="font-medium">All streamers</div>
            <div className="text-xs text-zinc-500">
              Combined performance across every handle
            </div>
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
                className="block rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors hover:border-blue-400 hover:bg-blue-50/60 dark:hover:border-blue-700 dark:hover:bg-blue-950/20"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium">@{o.handle}</span>
                  {!o.isActive && (
                    <span className="text-[11px] text-zinc-400">paused</span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">
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
