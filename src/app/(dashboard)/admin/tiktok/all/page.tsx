import { rangeFromParams } from "@/lib/date-range";
import {
  tiktokAccountsForPicker,
  tiktokLiveSessionList,
  type SessionRow,
} from "@/lib/tiktok-live/queries";
import { CompactDateFilter } from "@/components/compact-date-filter";
import { SessionHighlighter } from "@/app/(dashboard)/tiktok-live/session-highlighter";
import { SessionsTable } from "../sessions-table";
import { LiveAnalysis } from "../live-analysis";
import { StreamerSwitcher } from "../streamer-switcher";

/**
 * Combined TikTok Live performance across EVERY handle (admin monitoring). The
 * "All streamers" choice from the chooser on /admin/tiktok. Clicking a handle in
 * the table drills into that single streamer's page.
 */
export default async function AdminTikTokAllPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const choice = rangeFromParams(sp);

  // Export every streamer, for the SAME range the page is showing.
  const exportQs = new URLSearchParams();
  if (sp.range) exportQs.set("range", sp.range);
  if (sp.start) exportQs.set("start", sp.start);
  if (sp.end) exportQs.set("end", sp.end);
  const exportHref = `/api/tiktok-live/export${
    exportQs.toString() ? `?${exportQs.toString()}` : ""
  }`;

  // Every handle, for the "switch streamer" dropdown (best-effort).
  let handles: { id: string; handle: string }[] = [];
  try {
    handles = await tiktokAccountsForPicker();
  } catch {
    // non-fatal — the rest of the page still renders
  }
  // Carry the chosen period across when switching streamer.
  const preserve: Record<string, string> = {};
  if (sp.range) preserve.range = sp.range;
  if (sp.start) preserve.start = sp.start;
  if (sp.end) preserve.end = sp.end;

  let sessions: SessionRow[] = [];
  let error: string | null = null;
  try {
    sessions = await tiktokLiveSessionList(choice.range, 500);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <SessionHighlighter />

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All streamers</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Combined TikTok Live performance across every handle.
          </p>
          <div className="mt-2 w-full sm:w-64">
            <StreamerSwitcher handles={handles} value="all" preserve={preserve} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={exportHref}
            className="inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            Export CSV
          </a>
          <CompactDateFilter basePath="/admin/tiktok/all" choice={choice} />
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {/* Data analysis: headline cards + re-aggregatable charts, both date-filtered. */}
      <LiveAnalysis
        sessions={sessions}
        rangeLabel={choice.label}
        startStr={choice.startStr}
        endStr={choice.endStr}
      />

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Session history</h2>
        {sessions.length > 0 ? (
          <SessionsTable sessions={sessions} />
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-500">
            No lives in the selected range.
          </div>
        )}
      </section>
    </div>
  );
}
