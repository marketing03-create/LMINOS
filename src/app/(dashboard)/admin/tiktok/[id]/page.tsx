import Link from "next/link";
import { notFound } from "next/navigation";
import { rangeFromParams } from "@/lib/date-range";
import {
  tiktokAccountHeader,
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
 * One live streamer's (handle's) full details — its header, KPIs, session
 * history and data analysis, all scoped to that single handle. Reached by
 * clicking a handle in the admin TikTok Live list.
 */
export default async function StreamerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const choice = rangeFromParams(sp);

  const header = await tiktokAccountHeader(id);
  if (!header) notFound();

  // Every handle, for the "switch streamer" dropdown. Best-effort: if it fails
  // the dropdown just falls back to the combined view.
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

  // Export the SAME range the page is showing.
  const exportQs = new URLSearchParams({ account: id });
  if (sp.range) exportQs.set("range", sp.range);
  if (sp.start) exportQs.set("start", sp.start);
  if (sp.end) exportQs.set("end", sp.end);
  const exportHref = `/api/tiktok-live/export?${exportQs.toString()}`;

  const scope = [id];
  let sessions: SessionRow[] = [];
  let error: string | null = null;
  try {
    sessions = await tiktokLiveSessionList(choice.range, 500, scope);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const keywords = header.leadKeywords ?? [];

  return (
    <div className="p-4 sm:p-8">
      <SessionHighlighter />

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight font-mono">@{header.handle}</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                header.isActive
                  ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
              }`}
            >
              {header.isActive ? "active" : "paused"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {header.displayName || "—"}
            {header.streamerEmail && (
              <>
                {" · "}
                <span>
                  Streamer: {header.streamerName ? `${header.streamerName} ` : ""}
                  <span className="text-zinc-400">({header.streamerEmail})</span>
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/tiktok/history?handle=${encodeURIComponent(header.handle)}&from=${id}`}
            className="inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            Screenshot History
          </Link>
          <a
            href={exportHref}
            className="inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            Export CSV
          </a>
          <CompactDateFilter basePath={`/admin/tiktok/${id}`} choice={choice} />
        </div>
      </header>

      {/* Handle facts */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Fact label="Lead keywords">
          {keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {keywords.map((k) => (
                <span
                  key={k}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                >
                  {k}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-zinc-400">— none set —</span>
          )}
        </Fact>
        <Fact label="Last synced">
          {header.lastSyncedAt
            ? new Date(header.lastSyncedAt).toLocaleString("en-MY", { hour12: false })
            : "—"}
        </Fact>
        <Fact label="Switch streamer">
          <StreamerSwitcher handles={handles} value={id} preserve={preserve} />
        </Fact>
      </div>

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

      {/* Session history */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Session history</h2>
        {sessions.length > 0 ? (
          <SessionsTable sessions={sessions} linkHandle={false} />
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-500">
            No lives in the selected range.
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 bg-white dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
