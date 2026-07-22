"use client";

import {
  dmsByDate,
  durationByDate,
  leadsByHour,
  leadsByProduct,
  viewsByDate,
  viewsByHour,
  watchByDate,
  type Agg,
  type AnalysisSession,
} from "@/lib/tiktok-live/live-analysis-core";
import { BLUE, ChartCard, NON_SUM_AGGS, RED, type Series } from "./chart-card";

const LEADS: Series[] = [
  { key: "totalLeads", name: "Total Leads", color: BLUE },
  { key: "filteredLeads", name: "Filtered Leads", color: RED },
];

/** Below this, a per-hour lead breakdown is 1–2 lives per bar. */
const MIN_LEAD_LIVES = 5;

export function LiveAnalysisCharts({
  sessions,
  seedAgg,
}: {
  sessions: AnalysisSession[];
  /** Optional page-level "Combine by" value (the Overview supplies one). */
  seedAgg?: Agg;
}) {
  const leadLives = sessions.filter((s) => s.totalLeads != null).length;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard
        title="Live Duration by Date"
        subtitle="How long you streamed each day"
        unit="minutes"
        kind="line"
        series={[{ key: "duration", name: "Live duration", color: BLUE }]}
        build={durationByDate}
        sessions={sessions}
        defaultAgg="SUM"
        seedAgg={seedAgg}
        emptyHint="No data yet — needs lives with a recorded duration."
      />
      <ChartCard
        title="Total Viewers per Session"
        subtitle="Reach of each live over time"
        unit="views"
        kind="line"
        series={[{ key: "views", name: "Total viewers", color: BLUE }]}
        build={viewsByDate}
        sessions={sessions}
        defaultAgg="SUM"
        seedAgg={seedAgg}
        emptyHint="No data yet — needs lives with views recorded."
      />
      <ChartCard
        title="Daily Average Watch Time"
        subtitle="How long viewers stayed, day by day"
        unit="seconds"
        kind="line"
        series={[{ key: "watch", name: "Avg watch", color: BLUE }]}
        build={watchByDate}
        sessions={sessions}
        defaultAgg="AVG"
        seedAgg={seedAgg}
        // Already an average per live — summing per-live averages is meaningless.
        aggs={NON_SUM_AGGS}
        // Recorded on a minority of lives: joining the dots would draw a
        // confident trend straight across the days nobody entered.
        connectNulls={false}
        emptyHint="No data yet — needs lives with Avg watch (sec) keyed in."
        footnote="A gap means the number wasn't entered for that day, not that it was zero."
      />
      <ChartCard
        title="Daily Direct Messages"
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
      <ChartCard
        title="Views"
        subtitle="By time of day — which slot reaches the most people"
        unit="views"
        kind="line"
        series={[{ key: "views", name: "Views", color: BLUE }]}
        build={viewsByHour}
        sessions={sessions}
        defaultAgg="AVG"
        seedAgg={seedAgg}
        emptyHint="No data yet — needs lives with views recorded."
        footnote="Counted from the time each live started, so a long live counts once."
      />
      <ChartCard
        title="Product mix vs leads"
        subtitle="Each live counted once, under the products it promoted"
        kind="bar"
        series={LEADS}
        build={leadsByProduct}
        sessions={sessions}
        defaultAgg="SUM"
        seedAgg={seedAgg}
        emptyHint="No data yet — needs lives with a product tag and leads keyed in."
      />
      <ChartCard
        title="Leads by time of day"
        subtitle="Which slot brought the most customer contacts"
        kind="bar"
        series={LEADS}
        build={leadsByHour}
        // Below the floor, hand the chart nothing so it renders the explanation
        // instead of ~10 bars each resting on a single live.
        sessions={leadLives >= MIN_LEAD_LIVES ? sessions : []}
        defaultAgg="AVG"
        seedAgg={seedAgg}
        // Fade any hour built from fewer than 3 lives that actually had leads
        // entered — at 19% coverage most bars rest on one or two.
        dimBelowN={3}
        emptyHint={
          leadLives === 0
            ? "No lead numbers have been entered for these lives yet, so there's nothing to break down by time of day."
            : `Only ${leadLives} live${leadLives === 1 ? "" : "s"} here ${
                leadLives === 1 ? "has" : "have"
              } lead numbers entered — too few to split across the day. Fill in a few more and this chart appears.`
        }
        footnote="Faded bars come from fewer than three lives with leads entered."
      />
    </div>
  );
}
