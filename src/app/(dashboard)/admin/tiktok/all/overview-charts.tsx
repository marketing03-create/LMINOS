"use client";

import { useMemo, useState } from "react";
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
  dailyAverage,
  hours,
  type RateDef,
} from "@/lib/tiktok-live/overview-core";
import {
  BLUE,
  ChartCard,
  ChartChips,
  ChartSlot,
  NON_SUM_AGGS,
  RED,
  type Series,
} from "../chart-card";

/** Distinct colours for up to 6 handles; beyond that they cycle. */
const HANDLE_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#a855f7", "#f59e0b", "#0ea5e9"];

/**
 * The six charts, in the order they render, and the single source of both the
 * card titles and the mobile chip labels. Written once so a chip can never end
 * up naming a chart it does not scroll to — the failure mode of keeping two
 * lists in sync by hand.
 */
const TITLES = [
  "Views per live hour, by day",
  "Live duration by date",
  "Daily average watch time",
  "Daily direct messages",
  "Views per live hour, by part of day",
  "Leads by time of day",
] as const;

/** Full thousands-separated number, for tooltip detail rows. */
const nf = (n: number) => n.toLocaleString("en-MY");

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

  // Headline averages: the metric's period total ÷ the number of days that had
  // a live. Per-DAY, so each is labelled with its own unit — the views chart
  // plots a per-HOUR line and the two must not read as the same figure.
  const avgViewsPerDay = useMemo(
    () => dailyAverage(sessions, (s) => s.totalViews),
    [sessions]
  );
  const avgMinutesPerDay = useMemo(
    () =>
      dailyAverage(sessions, (s) =>
        s.durationSeconds == null ? null : s.durationSeconds / 60
      ),
    [sessions]
  );

  // Which chart the phone is showing. Client state and nothing else: the URL
  // carries `range`, `streamer` and `agg`, and adding a sixth thing to it would
  // put a chart choice into every shared link and every back-button press.
  const [active, setActive] = useState(0);

  return (
    <>
      <ChartChips
        titles={[...TITLES]}
        active={active}
        onSelect={setActive}
        label="Choose a chart"
      />

      {/* `lg:mb-8` rather than `mb-8`: below `lg` two of these three grids hold
          nothing but hidden slots, and a bare 32px margin under an empty grid is
          a gap the reader cannot account for. */}
      <div className="grid gap-4 lg:mb-8 lg:grid-cols-2">
        <ChartSlot index={0} active={active}>
          <ChartCard
            title={TITLES[0]}
            // The one subtitle on this page that survives, because it can be
            // false: it appears only when several handles are in scope, and it
            // is the only warning that these lines are not one channel's trend.
            subtitle={
              perHandle && handles.length > 1
                ? "One line per streamer — a change in who streamed can't look like a trend"
                : ""
            }
            unit="views per hour"
            kind="line"
            series={vphSeries}
            build={viewsPerHourByDate}
            sessions={sessions}
            defaultAgg="SUM"
            aggLock="Pooled rate"
            connectNulls={false}
            // Each point is labelled with that day's TOTAL views; the rate itself
            // (and the hours it was divided by) moves into the hover detail.
            pointLabel={{ dataKey: (k) => `${k}_total` }}
            // Total views leads; the rate and the hours it was divided by sit
            // under it as the supporting numbers.
            detail={(row, key) => {
              const total = row[`${key}_total`] as number | null;
              const den = row[`${key}_den`] as number | null;
              const out: { label: string; value: string; main?: boolean }[] = [];
              if (total != null)
                out.push({ label: "Total views", value: nf(total), main: true });
              if (den != null) out.push({ label: "Live hours", value: `${nf(den)}h` });
              return out;
            }}
            average={{
              value: avgViewsPerDay.value,
              unit: "views/day",
              title: `Total views ÷ the ${avgViewsPerDay.days} day${
                avgViewsPerDay.days === 1 ? "" : "s"
              } that had a live. Per day, not per hour — the line above is per hour.`,
            }}
            // "hover for both" is gone from the end of this sentence: a thumb has
            // no hover, and the readout strip under the plot now carries both
            // numbers on a tap.
            footnote="Numbers on the line are total views for that day. The line height is views per live hour (total views ÷ total live hours)."
            emptyHint="No data yet — needs lives with views and a duration recorded."
          />
        </ChartSlot>
        <ChartSlot index={1} active={active}>
          <ChartCard
            title={TITLES[1]}
            subtitle=""
            unit="minutes"
            kind="line"
            series={[{ key: "duration", name: "Live duration", color: BLUE }]}
            build={durationByDate}
            sessions={sessions}
            defaultAgg="SUM"
            seedAgg={seedAgg}
            average={{
              value: avgMinutesPerDay.value,
              unit: "min/day",
              title: `Total minutes streamed ÷ the ${avgMinutesPerDay.days} day${
                avgMinutesPerDay.days === 1 ? "" : "s"
              } that had a live.`,
            }}
            emptyHint="No data yet — needs lives with a recorded duration."
          />
        </ChartSlot>
      </div>

      {/* Typed-in metrics, visually separated: they are far less complete than
          the auto-captured block above, and mixing them would launder that.

          `hidden lg:block` on the two group headings and their notes, because
          below `lg` the chip strip IS the navigation — one chart is on screen at
          a time, and three standing section titles stacked above a single chart
          describe a layout the reader cannot see. Known cost: the `#audience`
          and `#timing` anchors do not scroll to anything on a phone. */}
      <h2 id="audience" className="mb-1 hidden scroll-mt-28 text-lg font-semibold lg:block">
        Audience detail
      </h2>
      <p className="mb-3 hidden text-xs text-zinc-500 lg:block">
        Typed in by the streamer from the TikTok creator backend, so these are only
        as complete as the data entry. Gaps are left as gaps.
      </p>
      <div className="grid gap-4 lg:mb-8 lg:grid-cols-2">
        <ChartSlot index={2} active={active}>
          <ChartCard
            title={TITLES[2]}
            subtitle=""
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
          />
        </ChartSlot>
        <ChartSlot index={3} active={active}>
          <ChartCard
            title={TITLES[3]}
            subtitle=""
            unit="messages"
            kind="line"
            series={[{ key: "dms", name: "Direct messages", color: BLUE }]}
            build={dmsByDate}
            sessions={sessions}
            defaultAgg="SUM"
            seedAgg={seedAgg}
            connectNulls={false}
            emptyHint="No data yet — needs lives with DMs keyed in."
          />
        </ChartSlot>
      </div>

      {/* ── Timing: the scheduling lever ─────────────────────────────────── */}
      <h2 id="timing" className="mb-1 hidden scroll-mt-28 text-lg font-semibold lg:block">
        Timing
      </h2>
      <p className="mb-3 hidden text-xs text-zinc-500 lg:block">
        Which slot to stream in — the lever you control most directly.
      </p>
      <div className="grid gap-4 lg:mb-8 lg:grid-cols-2">
        <ChartSlot index={4} active={active}>
          <ChartCard
            title={TITLES[4]}
            subtitle=""
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
        </ChartSlot>
        <ChartSlot index={5} active={active}>
          <ChartCard
            title={TITLES[5]}
            subtitle=""
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
        </ChartSlot>
      </div>
    </>
  );
}
