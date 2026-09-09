import { rangeFromParams } from "@/lib/date-range";
import {
  tiktokAccountsWithKeywords,
  tiktokLiveSessionList,
  type SessionRow,
} from "@/lib/tiktok-live/queries";
import { AGGREGATIONS, type Agg } from "@/lib/tiktok-live/live-analysis-core";
import { chaseList, handlesWithLeads } from "@/lib/tiktok-live/overview-core";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import { NoticeStrip, type NoticeItem } from "@/components/mobile/notice-strip";
import { PaneSwitcher, type Pane } from "@/components/mobile/pane-switcher";
import { SessionHighlighter } from "@/app/(dashboard)/tiktok-live/session-highlighter";
import { SessionsTable } from "../sessions-table";
import { toAnalysisSession } from "../live-analysis";
import { OverviewFilters } from "./overview-filters";
import { OverviewHeader } from "./overview-header";
import { OverviewCharts } from "./overview-charts";
import { StreamerTable } from "./streamer-table";
import { TopLives } from "./top-lives";
import { DataQuality } from "./data-quality";

const nf = (n: number) => n.toLocaleString("en-MY");

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
 *
 * Below `lg` that descent becomes five panes instead of ~6,000px of scroll, and
 * three things about the arrangement are deliberate:
 *
 *  - the panes are listed in TODAY'S source order, because `PaneSwitcher` drops
 *    to `lg:contents` at `lg` — the array IS the desktop DOM order, and the
 *    managers' daily screen must not move (P5). That is why "Chase" is fourth
 *    rather than second, where a phone-only ordering would put it.
 *  - the coverage caveats render ABOVE the switcher, outside every pane, so
 *    nobody can tap straight to Streamers and read a named person's blank as a
 *    zero without having seen "leads come from @adminain111 only" (fix F6).
 *  - the triage queue is NOT rebuilt here. `DataQuality` owns both surfaces of
 *    the chase list, so this route only reads `chaseList(slim).totalIncomplete`
 *    for the pane chip — recomputation of a count, no extra query, and no
 *    second copy of ten links to the same lives on the phone.
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

  // ── The triage material, from the functions the route already runs ───────
  const { withLeads, withoutLeads } = handlesWithLeads(slim);
  // Only the count, for the pane chip. The queue itself is rendered by
  // `DataQuality`, which calls `chaseList(sessions)` over the same array.
  const { totalIncomplete } = chaseList(slim);

  /**
   * The three standing caveats, compressed to one clause each. They lead with
   * the fact ("who has leads") and leave the reasoning to the expanded body —
   * on a phone a four-line amber paragraph is scrolled past, which is the one
   * thing a caveat must not be.
   */
  const notices: NoticeItem[] = [];
  if (withLeads.length > 0 && withoutLeads.length > 0) {
    notices.push({
      key: "lead-coverage",
      tone: "amber",
      short: `Leads: ${withLeads.map((h) => `@${h}`).join(", ")} only — ${withoutLeads
        .map((w) => `@${w.handle} has none (${w.lives} live${w.lives === 1 ? "" : "s"})`)
        .join(", ")}`,
      full: `Every lead figure on this page describes ${
        withLeads.length === 1 ? "one streamer" : "some streamers"
      }, not all of them.`,
    });
  }
  if (withLeads.length === 0 && slim.length > 0) {
    notices.push({
      key: "no-leads",
      tone: "amber",
      short: "No lead numbers entered in this period.",
      full: "Reach and timing still work — every lead figure below is empty for want of an entry, not because nobody signed up.",
    });
  }
  if (slim.length > 0 && slim.length < 5) {
    notices.push({
      key: "small-sample",
      tone: "amber",
      short: `Only ${nf(slim.length)} live${slim.length === 1 ? "" : "s"} — small sample.`,
      full: "Try a wider date range before reading much into these figures.",
    });
  }

  // Full-width: no max-w cap, so the cards, charts and wide tables use the whole
  // content area on desktop.
  return (
    <div className="px-4 py-5 sm:p-8">
      <SessionHighlighter />

      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Dashboard</h1>
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
          {/* Outside every pane, above the switcher — see fix F6 above. The
              desktop copies of these three live in `OverviewHeader`, where they
              have always been. */}
          {notices.length > 0 && (
            <div className="mb-4 lg:hidden">
              <NoticeStrip items={notices} />
            </div>
          )}

          <PaneSwitcher
            defaultPaneId="results"
            // The only gated pane. Six `ResponsiveContainer`s in a hidden box
            // measure at width 0 and then flicker when it is revealed, so they
            // wait until someone actually asks for charts (fix F8). Every other
            // pane is CSS-hidden and stays mounted.
            mountGatedIds={["charts"]}
            panes={
              [
                {
                  id: "results",
                  label: "Results",
                  children: <OverviewHeader sessions={slim} />,
                },
                {
                  id: "charts",
                  label: "Charts",
                  children: (
                    <OverviewCharts
                      sessions={slim}
                      seedAgg={agg}
                      perHandle={streamer === "all"}
                    />
                  ),
                },
                {
                  id: "streamers",
                  label: "Streamers",
                  children: (
                    <>
                      <StreamerTable
                        sessions={slim}
                        keywordsByAccount={keywordsByAccount}
                      />
                      <TopLives sessions={slim} />
                    </>
                  ),
                },
                {
                  id: "chase",
                  label: totalIncomplete > 0 ? `Chase (${totalIncomplete})` : "Chase",
                  children: (
                    <>
                      <DataQuality sessions={slim} />

                      {/* The queue itself is NOT built here. `DataQuality`
                          already renders the whole triage list below `lg` —
                          the connector-miss row, the `N of M lives missing
                          numbers` heading, every chase `TriageItem` and the
                          `…and N more` line — from `chaseList(sessions)` over
                          this same array. A second copy 100px above it would
                          show every actionable row, and every link to a live,
                          twice. What is genuinely missing down there is a route
                          to the words: the three `?` HelpTips beside that panel
                          only survive at `lg`. */}
                      <div className="mb-8 lg:hidden">
                        <HelpChip
                          keys={["chaseList", "connectorMiss", "notRecorded"]}
                          label="How to read this queue"
                        />
                      </div>
                    </>
                  ),
                },
                {
                  id: "lives",
                  label: "Lives",
                  children: (
                    <section className="mb-10">
                      <h2 className="mb-3 text-lg font-semibold">Session history</h2>
                      <SessionsTable
                        sessions={sessions}
                        linkHandle={streamer === "all"}
                      />
                    </section>
                  ),
                },
              ] satisfies Pane[]
            }
          />
        </>
      )}
    </div>
  );
}
