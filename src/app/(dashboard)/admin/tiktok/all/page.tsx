import { rangeFromParams } from "@/lib/date-range";
import {
  tiktokAccountsWithKeywords,
  tiktokLiveSessionList,
  type SessionRow,
} from "@/lib/tiktok-live/queries";
import { AGGREGATIONS, type Agg } from "@/lib/tiktok-live/live-analysis-core";
import { SessionHighlighter } from "@/app/(dashboard)/tiktok-live/session-highlighter";
import { SessionsTable } from "../sessions-table";
import { toAnalysisSession } from "../live-analysis";
import { OverviewFilters } from "./overview-filters";
import { OverviewHeader } from "./overview-header";
import { OverviewCharts } from "./overview-charts";
import { StreamerTable } from "./streamer-table";
import { TopLives } from "./top-lives";
import { DataQuality } from "./data-quality";

/**
 * The Overview — every card and chart for TikTok Live, filterable by date,
 * streamer and how to combine the charts.
 *
 * This is the same route the "All streamers" choice already pointed at, rebuilt
 * rather than duplicated: a second cross-streamer page would show the same rows
 * with different maths, and the wrong one is the one already bookmarked.
 *
 * Trust descends down the page. Auto-captured, near-complete material sits above
 * manually-typed material, and every figure that rests on a fraction of the
 * lives says so next to itself.
 */
export default async function AdminTikTokOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    start?: string;
    end?: string;
    streamer?: string;
    agg?: string;
  }>;
}) {
  const sp = await searchParams;

  // 30 days, not the shared 7-day default: a cross-streamer comparison off ~8
  // lives per handle is noise.
  const choice = rangeFromParams({
    range: sp.range ?? (sp.start && sp.end ? undefined : "30d"),
    start: sp.start,
    end: sp.end,
  });

  const agg: Agg = AGGREGATIONS.includes(sp.agg as Agg) ? (sp.agg as Agg) : "SUM";

  let handles: { id: string; handle: string; hasKeywords: boolean }[] = [];
  try {
    handles = await tiktokAccountsWithKeywords();
  } catch {
    // non-fatal — the page still renders without the streamer filter
  }

  // An unknown ?streamer= falls back to "all" rather than showing nothing.
  const streamer =
    sp.streamer && handles.some((h) => h.id === sp.streamer) ? sp.streamer : "all";
  const scope = streamer === "all" ? undefined : [streamer];

  let sessions: SessionRow[] = [];
  let error: string | null = null;
  try {
    sessions = await tiktokLiveSessionList(choice.range, 500, scope);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const slim = sessions.map(toAnalysisSession);
  const keywordsByAccount = new Map(handles.map((h) => [h.id, h.hasKeywords]));
  const scopeLabel =
    streamer === "all"
      ? "All streamers"
      : `@${handles.find((h) => h.id === streamer)?.handle ?? "unknown"}`;

  const exportQs = new URLSearchParams(
    choice.mode === "custom"
      ? { start: choice.startStr, end: choice.endStr }
      : { range: choice.presetKey ?? "30d" }
  );
  if (streamer !== "all") exportQs.set("account", streamer);

  // Full-width: no max-w cap, so the cards, charts and wide tables use the whole
  // content area on desktop.
  return (
    <div className="p-4 sm:p-8">
      <SessionHighlighter />

      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Every TikTok Live number in one place.
        </p>
      </header>

      <OverviewFilters
        choice={choice}
        handles={handles}
        streamer={streamer}
        agg={agg}
        exportHref={`/api/tiktok-live/export?${exportQs.toString()}`}
      />

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No lives {streamer === "all" ? "" : `for ${scopeLabel} `}in{" "}
          {choice.label.toLowerCase()}. Try a wider date range.
        </div>
      ) : (
        <>
          <OverviewHeader sessions={slim} />

          <OverviewCharts
            sessions={slim}
            seedAgg={agg}
            perHandle={streamer === "all"}
          />

          <StreamerTable sessions={slim} keywordsByAccount={keywordsByAccount} />

          <TopLives sessions={slim} />

          <DataQuality sessions={slim} />

          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold">Session history</h2>
            <SessionsTable sessions={sessions} linkHandle={streamer === "all"} />
          </section>
        </>
      )}
    </div>
  );
}
