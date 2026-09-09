"use client";

import { useState } from "react";
import { RecordCard, RecordList } from "@/components/mobile/record-card";
import type { MetricItem } from "@/components/mobile/metric-line";
import type { StreamerRow } from "@/lib/tiktok-live/overview-core";

/**
 * The twelve-column streamer comparison, below `lg`.
 *
 * A card list is genuinely the wrong shape for this table and pretending
 * otherwise would be the failure. Comparing streamers is a column-DOWN task —
 * "who is ahead on views per hour" — and a card list answers it by making the
 * reader hold one number in their head while they scroll past eleven others.
 * So the list shows ONE metric across ALL handles at a time, chosen by three
 * chips, and the rest of the row lives one tap down. (`MobileTable`'s "Show the
 * full grid" escape is enabled on this table too, for the manager on a
 * landscape phone who wants the real thing.)
 *
 * The chip is `useState` and nothing else — never a URL parameter. `range`,
 * `streamer` and `agg` are the page's frozen query contract; adding a fourth
 * would put a purely visual preference into a link people paste to each other,
 * and it would push a history entry on every tap.
 *
 * Why this is a client component when its siblings are not: it is the switcher
 * that needs state, and `"use client"` is per file. It receives `rows` already
 * computed by `streamerRows()` on the server, so the pure function runs once and
 * the boundary carries one small object per handle — two to five of them, not
 * the 500 sessions they were derived from.
 *
 * Row order is `streamerRows()` order — lives descending — and is never re-sorted
 * by the selected chip. That is a deliberate semantic in `overview-core.ts`:
 * ranking on a lead column ranks people by how diligently somebody else typed.
 * Switching the chip changes which number is on the face, never who is on top.
 */

type MetricKey = "views" | "leads" | "quality";

const CHIPS: { key: MetricKey; label: string }[] = [
  { key: "views", label: "Views / hr" },
  { key: "leads", label: "Leads / hr" },
  { key: "quality", label: "Quality" },
];

/** The face metric for each chip. `null` flows through `MetricLine` to "Not entered". */
function faceMetric(key: MetricKey, r: StreamerRow): MetricItem {
  if (key === "leads") return { label: "Leads / hr", value: r.leadsPerHour };
  if (key === "quality") {
    return {
      label: "Quality",
      value: r.qualityRate == null ? null : `${r.qualityRate}%`,
      denominator:
        r.livesWithBoth > 0
          ? `from ${r.livesWithBoth} of ${r.lives} lives with both numbers`
          : undefined,
    };
  }
  return { label: "Views / hr", value: r.viewsPerHour };
}

export type StreamerCardListProps = {
  /** Already ordered by `streamerRows()`. Do not re-sort. */
  rows: StreamerRow[];
  /** accountId → whether that handle has lead keywords configured. */
  keywords: Record<string, boolean>;
};

export function StreamerCardList({
  rows,
  keywords,
}: StreamerCardListProps): React.JSX.Element {
  const [metric, setMetric] = useState<MetricKey>("views");

  return (
    <div className="space-y-3">
      {/* A segmented control, not a select: three options that a manager flips
          between constantly should cost one tap, not two plus a picker. */}
      <div
        role="group"
        aria-label="Metric to compare"
        className="flex gap-2 rounded-xl border border-zinc-200 p-1 dark:border-zinc-800"
      >
        {CHIPS.map((c) => {
          const on = c.key === metric;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => setMetric(c.key)}
              className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                on
                  ? "bg-blue-600 text-white active:bg-blue-700"
                  : "text-zinc-600 active:bg-zinc-100 dark:text-zinc-300 dark:active:bg-zinc-800"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <RecordList legend="Not entered means nobody has keyed that number in yet — it is not a zero.">
        {rows.map((r) => {
          const noLeads = r.livesWithLeads === 0;
          const hasKeywords = keywords[r.accountId] ?? false;

          /* The rest of the row, in the table's own column order so muscle
             memory transfers, minus whichever one is already on the face. */
          const rest: MetricItem[] = [];
          if (metric !== "views")
            rest.push({ label: "Views / hr", value: r.viewsPerHour });
          rest.push({ label: "Median peak", value: r.medianPeak });
          rest.push({ label: "Comments / 1k views", value: r.commentsPer1kViews });
          rest.push({ label: "Followers / hr", value: r.followersPerHour });
          rest.push({ label: "Total Leads", value: r.totalLeads });
          if (metric !== "leads")
            rest.push({ label: "Leads / hr", value: r.leadsPerHour });
          if (metric !== "quality")
            rest.push({
              label: "Quality",
              value: r.qualityRate == null ? null : `${r.qualityRate}%`,
            });
          rest.push({
            label: "Keyword capture",
            value: hasKeywords ? "set up" : "not set up",
            tone: hasKeywords ? "default" : "warn",
            /* The consequence, not the instruction: an unconfigured handle's
               keyword count reads zero however many viewers commented, which is
               the one number on this card that lies rather than blanks. It is a
               denominator so it wraps at 12px on its own line instead of being
               a standing amber paragraph under the whole list. */
            denominator: hasKeywords
              ? undefined
              : "Keyword counts read zero until this handle's chat keywords are set.",
          });

          return (
            <RecordCard
              key={r.accountId}
              href={`/admin/tiktok/${r.accountId}`}
              tone={noLeads ? "warn" : "neutral"}
              title={<span className="font-mono">@{r.handle}</span>}
              /* The honesty line gets its own full-width row directly under the
                 handle, not a slot in the metric grid: it is the sentence that
                 decides whether the number below it means anything, and in a
                 two-column grid "0 of 12 — not recorded" wraps into a 163px
                 track and stops reading as a sentence at all. The wording is
                 the table's, verbatim — it is a statement about the data entry,
                 never about the person. */
              meta={
                <>
                  {r.lives} lives · {r.liveHours}h
                  <span
                    className={`mt-0.5 block ${
                      noLeads ? "text-amber-700 dark:text-amber-400" : ""
                    }`}
                  >
                    {noLeads
                      ? `0 of ${r.lives} — not recorded`
                      : `${r.livesWithLeads} of ${r.lives} lives have leads`}
                  </span>
                </>
              }
              primary={[faceMetric(metric, r)]}
              detail={rest}
              detailLabel="All figures"
            />
          );
        })}
      </RecordList>
    </div>
  );
}
