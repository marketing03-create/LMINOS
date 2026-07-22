import type { SessionRow } from "@/lib/tiktok-live/queries";
import {
  MIN_PAIRED,
  summaryCards,
  type AnalysisSession,
} from "@/lib/tiktok-live/live-analysis-core";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import { LiveAnalysisCharts } from "./live-analysis-charts";

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
  rangeLabel,
  startStr,
  endStr,
}: {
  sessions: SessionRow[];
  rangeLabel: string;
  startStr?: string;
  endStr?: string;
}) {
  // Slim + serialisable, so the client can re-aggregate instantly with no
  // further server round trips.
  const slim: AnalysisSession[] = sessions.map(toAnalysisSession);
  const k = summaryCards(slim);
  const nf = (n: number) => n.toLocaleString("en-MY");
  const period = startStr && endStr ? `${startStr} → ${endStr}` : rangeLabel;

  return (
    <section className="mb-10">
      {/* Period banner — echoes the date filter so the numbers below are never
          read against the wrong window. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Period
          </span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {rangeLabel}
          </span>
          <span className="text-xs text-zinc-500">{period}</span>
        </div>
        {/* Never "{leads} · {lives}" as parallel facts — an owner divides the two
            and invents a leads-per-live figure that is wrong by ~5×, because the
            leads come from a fraction of the lives. Bind them into one clause. */}
        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
          {nf(k.sessions)} live{k.sessions === 1 ? "" : "s"} ·{" "}
          {nf(k.totalLeads)} leads recorded on {k.livesWithLeads} of{" "}
          {nf(k.sessions)}
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          tone="violet"
          icon={<IconBroadcast />}
          value={nf(k.sessions)}
          label="Sessions"
          hint={`${k.liveHours}h streamed`}
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
          hint="documents submitted"
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
          hint="total entries into your lives"
          help={METRIC_HELP.views}
        />
        <Card
          tone="rose"
          icon={<IconPeak />}
          value={k.avgPeakViewers == null ? "—" : nf(k.avgPeakViewers)}
          label="Avg Peak Viewers"
          hint="average of each live's peak"
          help={`Average of each live's peak. ${METRIC_HELP.peak}`}
        />
        <Card
          tone="slate"
          icon={<IconClock />}
          value={`${k.liveHours}h`}
          label="Live Hours"
          hint={`across ${nf(k.sessions)} session${k.sessions === 1 ? "" : "s"}`}
          help={METRIC_HELP.liveHours}
        />
      </div>

      <LiveAnalysisCharts sessions={slim} />
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
