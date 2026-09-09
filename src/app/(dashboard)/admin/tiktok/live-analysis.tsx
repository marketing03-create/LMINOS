import type { SessionRow } from "@/lib/tiktok-live/queries";
import {
  MIN_PAIRED,
  summaryCards,
  type AnalysisSession,
} from "@/lib/tiktok-live/live-analysis-core";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import { Disclosure } from "@/components/mobile/disclosure";
import { MetricGrid, type MetricItem } from "@/components/mobile/metric-line";
import { LiveAnalysisCharts } from "./live-analysis-charts";
// From the plain titles module, never from the chart file itself: that one is
// `"use client"`, and a server component reading a value out of a client module
// gets Next's reference stub rather than the number — which then renders as the
// stub's source text inside the section heading, on desktop too.
import { CHART_COUNT } from "./live-analysis-chart-titles";

/**
 * SessionRow → the slim, serialisable shape the cards + charts share. One place,
 * so the per-streamer page and the Overview can never drift apart on which
 * columns they read.
 */
export function toAnalysisSession(s: SessionRow): AnalysisSession {
  return {
    id: s.id,
    accountId: s.accountId,
    handle: s.handle,
    startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : null,
    durationSeconds: s.durationSeconds,
    totalViews: s.totalViews,
    peakViewers: s.peakViewers,
    avgViewers: s.avgViewers,
    avgWatchSeconds: s.avgWatchSeconds,
    directMessages: s.directMessages,
    serviceBioViews: s.serviceBioViews,
    uniqueViewers: s.uniqueViewers,
    newFollowers: s.newFollowers,
    totalLikes: s.totalLikes,
    totalComments: s.totalComments,
    keywordLeads: s.keywordLeads,
    products: s.products,
    totalLeads: s.totalLeads,
    filteredLeads: s.filteredLeads,
  };
}

/**
 * Admin data analysis: ONE headline card row + the charts, both computed from
 * the SAME date-filtered rows — so a card can never disagree with the chart
 * under it, and the page's date picker moves everything at once.
 *
 * Cards are straight totals (a quality RATE only means anything against the
 * totals); each chart re-aggregates on its own via a
 * Total/Average/Min/Max/Count/Median picker.
 */
export function LiveAnalysis({
  sessions,
}: {
  sessions: SessionRow[];
  /**
   * Still on the contract because the route still passes them, and a prop
   * contract is not something a layout change gets to edit (P5). Nothing renders
   * them any more: the period banner they fed said the selected range a fourth
   * time, after the filter chip, the date inputs and the URL.
   */
  rangeLabel: string;
  startStr?: string;
  endStr?: string;
}) {
  // Slim + serialisable, so the client can re-aggregate instantly with no
  // further server round trips.
  const slim: AnalysisSession[] = sessions.map(toAnalysisSession);
  const k = summaryCards(slim);
  const nf = (n: number) => n.toLocaleString("en-MY");

  const lives = (n: number) => `${nf(n)} live${n === 1 ? "" : "s"}`;

  /**
   * The same seven figures as the cards to the right of this, one per row.
   *
   * The reason they are a separate list rather than the cards at a narrower
   * width: on a 375px phone those cards are 165px wide and their coverage hint
   * is 11px `truncate`, so `12 of 40 · from 6 lives` renders as `12 of 40 · f…`.
   * The half that gets deleted is the half that says how much of the period the
   * number covers — the caveat vanishes on exactly the device with the least
   * context around it. Here the hint is 12px, full width and wraps.
   *
   * Total and Filtered go to `null` when no live has that number entered, not to
   * the honest-looking `0` the sum produces. Nobody typing anything in is not
   * the same finding as nobody generating any leads, and this page carries one
   * named streamer's handle at the top of it.
   */
  const metrics: MetricItem[] = [
    { label: "Sessions", value: k.sessions },
    {
      label: "Total Leads",
      value: k.livesWithLeads > 0 ? k.totalLeads : null,
      hero: true,
      tone: k.livesWithLeads > 0 ? "accent" : "warn",
      denominator:
        k.livesWithLeads > 0
          ? `recorded on ${k.livesWithLeads} of ${lives(k.sessions)}`
          : `0 of ${lives(k.sessions)} — not recorded`,
    },
    {
      label: "Filtered Leads",
      value: k.livesWithFiltered > 0 ? k.filteredLeads : null,
      denominator:
        k.livesWithFiltered > 0
          ? `recorded on ${k.livesWithFiltered} of ${lives(k.sessions)}`
          : `0 of ${lives(k.sessions)} — not recorded`,
    },
    {
      label: "Lead Quality",
      value: k.qualityRate == null ? null : `${k.qualityRate}%`,
      // Read from the PAIRED sums, not the headline totals — otherwise the hint
      // quietly contradicts the percentage above it.
      denominator:
        k.qualityRate == null
          ? `needs ${MIN_PAIRED} lives with both numbers`
          : `${nf(k.pairedFiltered)} of ${nf(k.pairedTotal)} · from ${lives(k.livesWithBoth)}`,
    },
    { label: "Views", value: k.totalViews },
    { label: "Avg Peak Viewers", value: k.avgPeakViewers },
    { label: "Live Hours", value: `${k.liveHours}h` },
  ];

  return (
    <section className="mb-10">
      <div className="mb-6 lg:hidden">
        <MetricGrid items={metrics} />
      </div>

      {/* The desktop tiles, untouched and now `lg`-only. Their 11px truncating
          hint stays exactly as it is: at four columns on a laptop it has the room
          it needs, and repainting it would move pixels on the surface managers
          actually use (P5). */}
      <div className="mb-6 hidden grid-cols-2 gap-3 lg:grid lg:grid-cols-4">
        <Card
          tone="violet"
          icon={<IconBroadcast />}
          value={nf(k.sessions)}
          label="Sessions"
          // No hint: "Xh streamed" repeated the Live Hours tile two along.
          help={METRIC_HELP.sessions}
        />
        <Card
          tone="blue"
          icon={<IconUsers />}
          value={nf(k.totalLeads)}
          label="Total Leads"
          hint={`from ${k.livesWithLeads} live${k.livesWithLeads === 1 ? "" : "s"}`}
          help={METRIC_HELP.totalLeads}
        />
        <Card
          tone="amber"
          icon={<IconDocument />}
          value={nf(k.filteredLeads)}
          label="Filtered Leads"
          // No hint: "documents submitted" is the first clause of this tile's
          // own help sentence.
          help={METRIC_HELP.filteredLeads}
        />
        <Card
          tone="emerald"
          icon={<IconCheck />}
          value={k.qualityRate == null ? "—" : `${k.qualityRate}%`}
          label="Lead Quality"
          // Read from the PAIRED sums, not the headline totals — otherwise the
          // hint quietly contradicts the percentage above it.
          hint={
            k.qualityRate == null
              ? `needs ${MIN_PAIRED} lives with both numbers`
              : `${nf(k.pairedFiltered)} of ${nf(k.pairedTotal)} · from ${k.livesWithBoth} live${k.livesWithBoth === 1 ? "" : "s"}`
          }
          help={METRIC_HELP.leadQuality}
        />
        <Card
          tone="sky"
          icon={<IconEye />}
          value={nf(k.totalViews)}
          label="Views"
          // No hint: the Views help sentence says this in the same words.
          help={METRIC_HELP.views}
        />
        <Card
          tone="rose"
          icon={<IconPeak />}
          value={k.avgPeakViewers == null ? "—" : nf(k.avgPeakViewers)}
          label="Avg Peak Viewers"
          // No hint: the label already says "average of each live's peak".
          help={`Average of each live's peak. ${METRIC_HELP.peak}`}
        />
        <Card
          tone="slate"
          icon={<IconClock />}
          value={`${k.liveHours}h`}
          label="Live Hours"
          // No hint: that count is the Sessions tile, four along in the same row.
          help={METRIC_HELP.liveHours}
        />
      </div>

      {/* Seven charts at 240px each is ~2,300px of scrolling before the session
          table on a phone, in front of the leads figures that are what this page
          is for. Collapsed, they are one tap away instead. `.lm-sec` forces the
          body open at `lg`, so a manager on a laptop still sees all seven —
          `-mx-4` then pulls the summary's own padding back so its heading lines
          up with the rest of the page there. */}
      <div className="-mx-4">
        <Disclosure title="Charts" count={`${CHART_COUNT} charts`} headingLevel={2}>
          <LiveAnalysisCharts sessions={slim} />
        </Disclosure>
      </div>
    </section>
  );
}

type Tone = "violet" | "blue" | "amber" | "emerald" | "sky" | "rose" | "slate";

/** Accent colour per card: the top rule, the icon, and the figure itself. */
const TONE: Record<Tone, { bar: string; text: string; chip: string }> = {
  violet: {
    bar: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  },
  blue: {
    bar: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  },
  amber: {
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
  emerald: {
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  sky: {
    bar: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    chip: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  },
  rose: {
    bar: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  },
  slate: {
    bar: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-300",
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
};

function Card({
  tone,
  icon,
  value,
  label,
  hint,
  help,
}: {
  tone: Tone;
  icon: React.ReactNode;
  value: string;
  label: string;
  hint?: string;
  help: string;
}) {
  const t = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      {/* colour rule along the top edge */}
      <span className={`absolute inset-x-0 top-0 h-0.5 ${t.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.chip}`}
          aria-hidden
        >
          {icon}
        </span>
        <HelpTip text={help} label={`What is ${label}?`} />
      </div>
      <div className={`mt-3 text-3xl font-semibold tabular-nums leading-none ${t.text}`}>
        {value}
      </div>
      <div className="mt-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {label}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}

// ── Icons (inline, to match the house style elsewhere) ──
const sv = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const IconBroadcast = () => (
  <svg {...sv}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" />
  </svg>
);
const IconUsers = () => (
  <svg {...sv}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.3 2.9-5 6.5-5s6.5 1.7 6.5 5" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2.2.5 3.5 1.9 3.5 4" />
  </svg>
);
const IconDocument = () => (
  <svg {...sv}>
    <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z" />
    <path d="M14 3v4h4M9 13h6M9 17h4" />
  </svg>
);
const IconCheck = () => (
  <svg {...sv}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </svg>
);
const IconEye = () => (
  <svg {...sv}>
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconPeak = () => (
  <svg {...sv}>
    <path d="M3 17l5-6 4 4 4-6 5 5" />
    <path d="M3 21h18" />
  </svg>
);
const IconClock = () => (
  <svg {...sv}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
