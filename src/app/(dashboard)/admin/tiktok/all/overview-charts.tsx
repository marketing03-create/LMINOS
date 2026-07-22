"use client";

import { useMemo } from "react";
import {
  byDate,
  durationByDate,
  leadsByHour,
  watchByDate,
  dmsByDate,
  type Agg,
  type AnalysisSession,
  type ChartRow,
} from "@/lib/tiktok-live/live-analysis-core";
import {
  buildRateChart,
  byPartOfDay,
  hours,
  type RateDef,
} from "@/lib/tiktok-live/overview-core";
import { BLUE, ChartCard, NON_SUM_AGGS, RED, type Series } from "../chart-card";

/** Distinct colours for up to 6 handles; beyond that they cycle. */
const HANDLE_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#a855f7", "#f59e0b", "#0ea5e9"];

const LEADS: Series[] = [
  { key: "totalLeads", name: "Total Leads", color: BLUE },
  { key: "filteredLeads", name: "Filtered Leads", color: RED },
];

const MIN_LEAD_LIVES = 5;

export function OverviewCharts({
  sessions,
  seedAgg,
  perHandle,
}: {
  sessions: AnalysisSession[];
  seedAgg: Agg;
  /** True when viewing all streamers — draw one line per handle. */
  perHandle: boolean;
}) {
  const handles = useMemo(
    () => [...new Set(sessions.map((s) => s.handle))].sort(),
    [sessions]
  );

  /**
   * Views per live hour, one series per handle when several are in scope.
   *
   * A single blended line would let a change in WHO streamed masquerade as a
   * change in how well the channel is doing — if a lower-reach handle streams
   * more this week, the blended line falls without anyone's performance moving.
   */
  const vphSeries: Series[] = useMemo(() => {
    if (!perHandle || handles.length < 2) {
      return [{ key: "vph", name: "Views per live hour", color: BLUE }];
    }
    return handles.map((h, i) => ({
      key: `vph_${h}`,
      name: `@${h}`,
      color: HANDLE_COLORS[i % HANDLE_COLORS.length],
    }));
  }, [handles, perHandle]);

  const vphRates: RateDef[] = useMemo(() => {
    if (!perHandle || handles.length < 2) {
      return [{ key: "vph", name: "Views per live hour", num: (s) => s.totalViews, den: hours }];
    }
    return handles.map((h) => ({
      key: `vph_${h}`,
      name: `@${h}`,
      num: (s: AnalysisSession) => (s.handle === h ? s.totalViews : null),
      den: (s: AnalysisSession) => (s.handle === h ? hours(s) : null),
    }));
  }, [handles, perHandle]);

  const viewsPerHourByDate = useMemo(
    () => (rows: AnalysisSession[]): ChartRow[] =>
      buildRateChart(rows, byDate, vphRates),
    [vphRates]
  );
  const viewsPerHourByPart = useMemo(
    () => (rows: AnalysisSession[]): ChartRow[] =>
      buildRateChart(rows, byPartOfDay, [
        { key: "vph", name: "Views per live hour", num: (s) => s.totalViews, den: hours },
      ]),
    []
  );

  const leadLives = sessions.filter((s) => s.totalLeads != null).length;

  return (
    <>
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Views per live hour, by day"
          subtitle={
            perHandle && handles.length > 1
              ? "One line per streamer — a change in who streamed can't look like a trend"
              : "Reach earned per hour streamed"
          }
          unit="views per hour"
          kind="line"
          series={vphSeries}
          build={viewsPerHourByDate}
          sessions={sessions}
          defaultAgg="SUM"
          aggLock="Pooled rate"
          connectNulls={false}
          emptyHint="No data yet — needs lives with views and a duration recorded."
        />
        <ChartCard
          title="Live duration by date"
          subtitle="How long was streamed each day"
          unit="minutes"
          kind="line"
          series={[{ key: "duration", name: "Live duration", color: BLUE }]}
          build={durationByDate}
          sessions={sessions}
          defaultAgg="SUM"
          seedAgg={seedAgg}
          emptyHint="No data yet — needs lives with a recorded duration."
        />
      </div>

      {/* Typed-in metrics, visually separated: they are far less complete than
          the auto-captured block above, and mixing them would launder that. */}
      <h2 id="audience" className="mb-1 scroll-mt-28 text-lg font-semibold">
        Audience detail
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Typed in by the streamer from the TikTok creator backend, so these are only
        as complete as the data entry. Gaps are left as gaps.
      </p>
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Daily average watch time"
          subtitle="How long viewers stayed, day by day"
          unit="seconds"
          kind="line"
          series={[{ key: "watch", name: "Avg watch", color: BLUE }]}
          build={watchByDate}
          sessions={sessions}
          defaultAgg="AVG"
          seedAgg={NON_SUM_AGGS.includes(seedAgg) ? seedAgg : undefined}
          aggs={NON_SUM_AGGS}
          connectNulls={false}
          emptyHint="No data yet — needs lives with Avg watch (sec) keyed in."
          footnote="A gap means the number wasn't entered for that day, not that it was zero."
        />
        <ChartCard
          title="Daily direct messages"
          subtitle="DMs received, day by day"
          unit="messages"
          kind="line"
          series={[{ key: "dms", name: "Direct messages", color: BLUE }]}
          build={dmsByDate}
          sessions={sessions}
          defaultAgg="SUM"
          seedAgg={seedAgg}
          connectNulls={false}
          emptyHint="No data yet — needs lives with DMs keyed in."
          footnote="A gap means the number wasn't entered for that day, not that it was zero."
        />
      </div>

      {/* ── Timing: the scheduling lever ─────────────────────────────────── */}
      <h2 id="timing" className="mb-1 scroll-mt-28 text-lg font-semibold">
        Timing
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Which slot to stream in — the lever you control most directly.
      </p>
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Views per live hour, by part of day"
          subtitle="Which block of the day reaches the most people"
          unit="views per hour"
          kind="bar"
          series={[{ key: "vph", name: "Views per live hour", color: BLUE }]}
          build={viewsPerHourByPart}
          sessions={sessions}
          defaultAgg="SUM"
          aggLock="Pooled rate"
          dimBelowN={3}
          emptyHint="No data yet — needs lives with views and a duration recorded."
          footnote="Counted from the time each live started, so a 4-hour live counts once, in the block it began. Faded bars come from fewer than three lives."
        />
        <ChartCard
          title="Leads by time of day"
          subtitle="Which slot brought the most customer contacts"
          kind="bar"
          series={LEADS}
          build={leadsByHour}
          sessions={leadLives >= MIN_LEAD_LIVES ? sessions : []}
          defaultAgg="AVG"
          seedAgg={seedAgg}
          dimBelowN={3}
          emptyHint={
            leadLives === 0
              ? "No lead numbers have been entered for these lives yet, so there's nothing to break down by time of day."
              : `Only ${leadLives} live${leadLives === 1 ? "" : "s"} here ${
                  leadLives === 1 ? "has" : "have"
                } lead numbers entered — too few to split across the day.`
          }
          footnote="Faded bars come from fewer than three lives with leads entered."
        />
      </div>
    </>
  );
}
