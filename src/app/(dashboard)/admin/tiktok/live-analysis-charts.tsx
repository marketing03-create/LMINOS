"use client";

import { useState } from "react";
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
import {
  BLUE,
  ChartCard,
  ChartChips,
  ChartSlot,
  NON_SUM_AGGS,
  RED,
  type Series,
} from "./chart-card";
/**
 * The titles live in a plain module, not here. `live-analysis.tsx` is a server
 * component and needs the count for its `Disclosure` label; a server component
 * cannot read a value out of a `"use client"` module — Next hands it a client
 * reference, and the template literal prints that stub's source into the
 * heading. See the note on the titles module.
 *
 * One list feeding both the card titles and the mobile chip labels, so a chip
 * can never name a chart it does not reveal. Verbatim titles rather than short
 * labels: a chip that says something the card heading does not is a second name
 * for the same thing to learn.
 */
import { LIVE_ANALYSIS_CHART_TITLES as TITLES } from "./live-analysis-chart-titles";

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

  // Which chart the phone shows. Deliberately not in the URL: this page's query
  // string is the frozen `range`/`start`/`end` contract that the export link and
  // the streamer switcher both rebuild, and a chart choice has no business
  // riding along in a link someone pastes into chat.
  const [active, setActive] = useState(0);

  return (
    <>
      <ChartChips
        titles={[...TITLES]}
        active={active}
        onSelect={setActive}
        label="Choose a chart"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSlot index={0} active={active}>
          <ChartCard
            title={TITLES[0]}
            subtitle=""
            unit="minutes"
            kind="line"
            series={[{ key: "duration", name: "Live duration", color: BLUE }]}
            build={durationByDate}
            sessions={sessions}
            defaultAgg="SUM"
            seedAgg={seedAgg}
            emptyHint="No data yet — needs lives with a recorded duration."
          />
        </ChartSlot>
        <ChartSlot index={1} active={active}>
          <ChartCard
            title={TITLES[1]}
            subtitle=""
            unit="views"
            kind="line"
            series={[{ key: "views", name: "Total viewers", color: BLUE }]}
            build={viewsByDate}
            sessions={sessions}
            defaultAgg="SUM"
            seedAgg={seedAgg}
            emptyHint="No data yet — needs lives with views recorded."
          />
        </ChartSlot>
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
            seedAgg={seedAgg}
            // Already an average per live — summing per-live averages is meaningless.
            aggs={NON_SUM_AGGS}
            // Recorded on a minority of lives: joining the dots would draw a
            // confident trend straight across the days nobody entered.
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
        <ChartSlot index={4} active={active}>
          <ChartCard
            title={TITLES[4]}
            // Kept: the title is one word and this is the line that says which
            // axis you are looking at. It is not a rephrasing of anything.
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
        </ChartSlot>
        <ChartSlot index={5} active={active}>
          <ChartCard
            title={TITLES[5]}
            // Kept: a counting rule, not a restatement. A live tagged with two
            // products appears under both, and a reader who does not know that
            // will add the bars up and get more lives than there are.
            subtitle="Each live counted once, under the products it promoted"
            kind="bar"
            series={LEADS}
            build={leadsByProduct}
            sessions={sessions}
            defaultAgg="SUM"
            seedAgg={seedAgg}
            emptyHint="No data yet — needs lives with a product tag and leads keyed in."
          />
        </ChartSlot>
        <ChartSlot index={6} active={active}>
          <ChartCard
            title={TITLES[6]}
            subtitle=""
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
        </ChartSlot>
      </div>
    </>
  );
}
