import { HelpTip } from "@/components/help-tip";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import { MetricGrid, MetricLine, type MetricItem } from "@/components/mobile/metric-line";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import {
  MIN_PAIRED,
  summaryCards,
  type AnalysisSession,
} from "@/lib/tiktok-live/live-analysis-core";
import {
  handlesWithLeads,
  hours,
  pooledRate,
  type Rate,
} from "@/lib/tiktok-live/overview-core";

const nf = (n: number) => n.toLocaleString("en-MY");
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The top of the Overview: what happened, on how much evidence.
 *
 * Every lead figure here carries its own denominator inline. The rule the whole
 * section exists to enforce: a reader must never be able to divide two numbers
 * shown side by side and get a wrong answer. Leads sit on ~19% of lives while
 * hours sit on 100%, so "1,013 leads" next to "210h streamed" invites a
 * leads-per-hour figure that is wrong by about 4×.
 *
 * The phone gets the same figures as `MetricLine`s and the desktop keeps its
 * card grid (P5 — siblings, never a swap). Two things differ below `lg`, and
 * both are the same rule seen twice:
 *
 *  - a total that rests on ZERO entered lives renders "Not entered", not 0. The
 *    sum is arithmetically 0 either way, but 0 reads as a result — and next to
 *    a named streamer it is a public verdict about them rather than about our
 *    data entry (P1). The denominator says "0 of 63" in amber beside it.
 *  - the denominator is 12px and wraps. It used to be a 10px `truncate`d line,
 *    which deleted the caveat at exactly the width where it mattered most.
 */
export function OverviewHeader({ sessions }: { sessions: AnalysisSession[] }) {
  const k = summaryCards(sessions);
  const { withLeads, withoutLeads } = handlesWithLeads(sessions);

  const leadsPerHour = pooledRate(sessions, (s) => s.totalLeads, hours);
  const leadsPer1kViews = pooledRate(
    sessions,
    (s) => s.totalLeads,
    (s) => s.totalViews,
    { scale: 1000, round: round2 }
  );
  const viewsPerHour = pooledRate(sessions, (s) => s.totalViews, hours, {
    minLives: 1,
  });
  const followersPerHour = pooledRate(sessions, (s) => s.newFollowers, hours, {
    minLives: 1,
  });

  const followers = sessions.reduce((t, s) => t + (s.newFollowers ?? 0), 0);
  const followerLives = sessions.filter((s) => s.newFollowers != null).length;

  const qualityHint =
    k.qualityRate == null
      ? `needs ${MIN_PAIRED} lives with both numbers`
      : `${nf(k.pairedFiltered)} of ${nf(k.pairedTotal)} · from ${k.livesWithBoth} lives`;

  /** The two pooled rates read the same way on both surfaces. */
  const rateHint = (rate: Rate) =>
    rate.value == null
      ? `needs 5 lives with both numbers — ${rate.lives} of ${sessions.length} qualify`
      : `from ${rate.lives} of ${sessions.length} lives · ${rate.handles
          .map((h) => `@${h}`)
          .join(", ")}`;

  const outcomes: MetricItem[] = [
    {
      label: "Filtered Leads",
      value: k.livesWithFiltered === 0 ? null : k.filteredLeads,
      // livesWithFiltered, not livesWithBoth — the sum comes from every live
      // with Filtered entered, so the two must match exactly.
      denominator:
        k.livesWithFiltered === 0
          ? `0 of ${nf(k.sessions)} lives — not entered`
          : `documents submitted · ${k.livesWithFiltered} of ${nf(k.sessions)} lives`,
      tone: k.livesWithFiltered === 0 ? "warn" : "default",
    },
    {
      label: "Lead Quality",
      value: k.qualityRate == null ? null : `${k.qualityRate}%`,
      denominator: qualityHint,
      tone: k.qualityRate == null ? "warn" : "default",
    },
    {
      label: "Lives",
      value: k.sessions,
      denominator: `${k.liveHours}h streamed`,
    },
    {
      label: "Leads per hour streamed",
      value: leadsPerHour.value,
      denominator: rateHint(leadsPerHour),
    },
    {
      label: "Leads per 1,000 views",
      value: leadsPer1kViews.value,
      denominator: rateHint(leadsPer1kViews),
    },
  ];

  const reach: MetricItem[] = [
    { label: "Views", value: k.totalViews },
    { label: "Avg peak", value: k.avgPeakViewers },
    {
      label: "New followers",
      value: followerLives > 0 ? followers : null,
      denominator:
        followerLives < sessions.length
          ? `${followerLives} of ${sessions.length} lives`
          : undefined,
    },
    { label: "Live hours", value: `${k.liveHours}h` },
    { label: "Views / live hr", value: viewsPerHour.value },
    { label: "Followers / live hr", value: followersPerHour.value },
  ];

  return (
    <>
      {/* The scope ribbon that used to sit here is gone: the period, the
          streamer and the live count were each already stated by the filter bar
          or the Lives card. Only the coverage warning was unique, so it stays —
          moved to sit directly above the cards it qualifies.

          Desktop only. On a phone the same three caveats are one `NoticeStrip`
          line ABOVE the pane switcher (fix F6), because a caveat that lives
          inside a pane can be missed by someone who taps straight to Streamers
          and reads a named person's blank as a zero. */}
      <div className="hidden lg:block">
        {withoutLeads.length > 0 && withLeads.length > 0 && (
          <Notice>
            Lead numbers on this page come from{" "}
            {withLeads.map((h) => `@${h}`).join(", ")} only.{" "}
            {withoutLeads
              .map((w) => `@${w.handle} streamed ${w.lives} live${w.lives === 1 ? "" : "s"}`)
              .join(", ")}{" "}
            with no leads entered, so every lead figure below describes{" "}
            {withLeads.length === 1 ? "one streamer" : "some streamers"}, not all.
          </Notice>
        )}
        {withLeads.length === 0 && k.sessions > 0 && (
          <Notice>
            No lead numbers have been entered for any live in this period, so the
            lead cards below are empty. Reach and timing still work.
          </Notice>
        )}
        {k.sessions > 0 && k.sessions < 5 && (
          <Notice>
            Only {nf(k.sessions)} live{k.sessions === 1 ? "" : "s"} in this window —
            too few to read much into. Try a wider date range.
          </Notice>
        )}
      </div>

      {/* ── Phone: the same figures, one per row ─────────────────────────── */}
      <div className="lg:hidden">
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
          {/* The one 28px number on this screen. Its denominator is welded on:
              "1,013" and "recorded on 12 of 63 lives" are a single claim, and
              splitting them is what lets a reader divide it by something it
              was never measured against. */}
          <div className="border-b border-zinc-100 dark:border-zinc-800">
            <MetricLine
              hero
              label="Total Leads"
              value={k.livesWithLeads === 0 ? null : k.totalLeads}
              denominator={
                k.livesWithLeads === 0
                  ? `0 of ${nf(k.sessions)} lives — not entered`
                  : `recorded on ${k.livesWithLeads} of ${nf(k.sessions)} lives`
              }
              tone={k.livesWithLeads === 0 ? "warn" : "default"}
            />
          </div>
          <MetricGrid items={outcomes} />
        </div>

        <h2 className="mb-1 text-[17px] font-semibold">Reach &amp; audience</h2>
        <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
          <MetricGrid items={reach} cols={2} />
        </div>

        {/* One help affordance for the whole pane, instead of twelve 16px `?`
            glyphs a thumb cannot hit. */}
        <div className="mb-8">
          <HelpChip
            keys={[
              "totalLeads",
              "filteredLeads",
              "leadQuality",
              "sessions",
              "leadsPerLiveHour",
              "leadsPer1kViews",
              "views",
              "peak",
              "followers",
              "liveHours",
              "viewsPerLiveHour",
              "followersPerLiveHour",
              "notRecorded",
            ]}
            label="What do these numbers mean?"
          />
        </div>
      </div>

      {/* ── Desktop: the card grid, unchanged ────────────────────────────── */}
      <div className="hidden lg:block">
        {/* ── Outcome cards ─────────────────────────────────────────────── */}
        <h2 id="results" className="mb-1 scroll-mt-28 text-lg font-semibold">
          Results
        </h2>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card
            tone="blue"
            value={nf(k.totalLeads)}
            label="Total Leads"
            hint={`recorded on ${k.livesWithLeads} of ${nf(k.sessions)} lives`}
            weak={k.livesWithLeads === 0}
            help={METRIC_HELP.totalLeads}
          />
          <Card
            tone="amber"
            value={nf(k.filteredLeads)}
            label="Filtered Leads"
            // livesWithFiltered, not livesWithBoth — the sum above comes from
            // every live with Filtered entered, so the two must match exactly.
            hint={`documents submitted · ${k.livesWithFiltered} of ${nf(k.sessions)} lives`}
            weak={k.filteredLeads === 0}
            help={METRIC_HELP.filteredLeads}
          />
          <Card
            tone="emerald"
            value={k.qualityRate == null ? "—" : `${k.qualityRate}%`}
            label="Lead Quality"
            hint={qualityHint}
            weak={k.qualityRate == null}
            help={METRIC_HELP.leadQuality}
          />
          <Card
            tone="violet"
            value={nf(k.sessions)}
            label="Lives"
            hint={`${k.liveHours}h streamed`}
            help={METRIC_HELP.sessions}
          />
        </div>

        {/* Two rate tiles — the figures an owner would otherwise compute wrongly
            by dividing two cards. */}
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RateTile
            rate={leadsPerHour}
            label="Leads per hour streamed"
            suffix=" / hr"
            help={METRIC_HELP.leadsPerLiveHour}
            hint={rateHint(leadsPerHour)}
          />
          <RateTile
            rate={leadsPer1kViews}
            label="Leads per 1,000 views"
            help={METRIC_HELP.leadsPer1kViews}
            hint={rateHint(leadsPer1kViews)}
          />
        </div>

        {/* ── Reach stat strip ──────────────────────────────────────────── */}
        <h2 id="reach" className="mb-1 scroll-mt-28 text-lg font-semibold">
          Reach &amp; audience
        </h2>
        <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-6 dark:border-zinc-800 dark:bg-zinc-800">
          <Stat label="Views" value={nf(k.totalViews)} help={METRIC_HELP.views} />
          <Stat
            label="Avg peak"
            value={k.avgPeakViewers == null ? "—" : nf(k.avgPeakViewers)}
            help={METRIC_HELP.peak}
          />
          <Stat
            label="New followers"
            value={followerLives > 0 ? nf(followers) : "—"}
            sub={followerLives < sessions.length ? `${followerLives} of ${sessions.length}` : undefined}
            help={METRIC_HELP.followers}
          />
          <Stat label="Live hours" value={`${k.liveHours}h`} help={METRIC_HELP.liveHours} />
          <Stat
            label="Views / live hr"
            value={viewsPerHour.value == null ? "—" : nf(viewsPerHour.value)}
            help={METRIC_HELP.viewsPerLiveHour}
          />
          <Stat
            label="Followers / live hr"
            value={followersPerHour.value == null ? "—" : nf(followersPerHour.value)}
            help={METRIC_HELP.followersPerLiveHour}
          />
        </div>
      </div>
    </>
  );
}

/** An amber caveat about the numbers immediately below it. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
      {children}
    </p>
  );
}

/** A pooled rate, always shown with the sample it rests on. */
function RateTile({
  rate,
  label,
  suffix = "",
  help,
  hint,
}: {
  rate: Rate;
  label: string;
  suffix?: string;
  help: string;
  /** The sample line, formatted by the caller so both surfaces read alike. */
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-semibold tabular-nums ${
                rate.value == null
                  ? "text-zinc-300 dark:text-zinc-700"
                  : "text-zinc-900 dark:text-zinc-100"
              }`}
            >
              {rate.value == null ? "—" : rate.value.toLocaleString("en-MY")}
            </span>
            {rate.value != null && (
              <span className="text-xs text-zinc-500">{suffix}</span>
            )}
          </div>
          <div className="mt-0.5 text-sm font-medium">{label}</div>
          {/* 12px, not 10: a caveat may never be set smaller than the number it
              qualifies (§2.1). */}
          <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <HelpTip text={help} label={`What is ${label}?`} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  help,
}: {
  label: string;
  value: string;
  sub?: string;
  help: string;
}) {
  return (
    <div className="bg-white px-3 py-2.5 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-1">
        {/* Not `truncate`: "Followers / live hr" is the label that told you what
            the number under it even is, and clipping it to "Followers /…" is
            how a stat becomes unreadable. It wraps to two lines instead. */}
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        <HelpTip text={help} label={`What is ${label}?`} />
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

type Tone = "blue" | "amber" | "emerald" | "violet";
const TONE: Record<Tone, { bar: string; text: string }> = {
  blue: { bar: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
  amber: { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  emerald: { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  violet: { bar: "bg-violet-500", text: "text-violet-600 dark:text-violet-400" },
};

function Card({
  tone,
  value,
  label,
  hint,
  help,
  weak,
}: {
  tone: Tone;
  value: string;
  label: string;
  hint: string;
  help: string;
  /** Greys the figure when it rests on nothing — a loud 0 reads as a result. */
  weak?: boolean;
}) {
  const t = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${t.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {label}
        </div>
        <HelpTip text={help} label={`What is ${label}?`} />
      </div>
      <div
        className={`mt-2 text-3xl font-semibold tabular-nums leading-none ${
          weak ? "text-zinc-300 dark:text-zinc-700" : t.text
        }`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-xs leading-snug text-zinc-500">{hint}</div>
    </div>
  );
}
