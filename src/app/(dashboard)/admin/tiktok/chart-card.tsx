"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AGG_LABEL,
  AGGREGATIONS,
  type Agg,
  type AnalysisSession,
  type ChartRow,
} from "@/lib/tiktok-live/live-analysis-core";
import { NotEntered } from "@/components/mobile/not-entered";
import { useIsNarrow } from "@/components/mobile/use-is-narrow";

/**
 * The shared chart tile: one chart plus its own Total/Average/Min/Max/Count/
 * Median picker. Extracted from live-analysis-charts.tsx so the Overview can
 * reuse the exact same visual language rather than growing a second one.
 *
 * Beyond the original it can: seed its picker from a page-level control, offer a
 * restricted set of aggregations (a SUM of per-live averages is meaningless),
 * lock the picker entirely (a pooled rate is always sum÷sum), leave gaps where
 * a metric was never recorded, and fade buckets built from too few lives.
 *
 * The prop contract does not change on a phone — every adaptation happens inside
 * this file, so no call site has to know a viewport exists. What changes below
 * `lg` is: a shorter plot, thinner axis gutter, fewer ticks, no point labels, a
 * picker a thumb can actually hit, and — the important one — a readout strip
 * that survives the finger lifting off the screen. See the strip's own note.
 */

export const BLUE = "#3b82f6";
export const RED = "#ef4444";
const AXIS = "#8b93a7";
const GRID = "rgba(148,163,184,0.18)";

/** Compact axis ticks — 8 400 → "8.4k", so a 4-digit label can't get clipped. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n * 10) / 10);
}
const full = (n: number) => n.toLocaleString("en-MY");

export type Series = { key: string; name: string; color: string };

/** Aggregations valid for a metric that is ALREADY an average per live. */
export const NON_SUM_AGGS: readonly Agg[] = ["AVG", "MEDIAN", "MIN", "MAX", "COUNT"];

/**
 * Shared tooltip. Reports the per-series contributing count (`<key>_n`) rather
 * than the bucket's live count, so a bar built from 1 recorded live out of 6
 * can't advertise "6 lives" and manufacture confidence it hasn't earned.
 */
/**
 * Extra "how this number was worked out" rows, shown under a series in the
 * tooltip. Mark one `main` to promote it to the headline — the plotted series
 * value then drops to a sub-row, so a chart can lead with the figure people care
 * about (a total) while still showing the rate the line is drawn from.
 */
export type DetailRow = { label: string; value: string; main?: boolean };

function ChartTooltip({
  active,
  payload,
  label,
  rows,
  detail,
}: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string; dataKey?: string }[];
  label?: string | number;
  rows: ChartRow[];
  detail?: (row: ChartRow, seriesKey: string) => DetailRow[];
}) {
  if (!active || !payload?.length) return null;
  const row = rows.find((r) => r.label === label);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
      <div className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">
        {String(label)}
        {row?.n != null && (
          <span className="ml-1 font-normal text-zinc-500">
            · {row.n} live{row.n === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {payload.map((p) => {
        const contributed = p.dataKey ? (row?.[`${p.dataKey}_n`] as number | undefined) : undefined;
        const extras = row && p.dataKey && detail ? detail(row, p.dataKey) : [];
        // A detail row flagged `main` takes the headline; the series' own value
        // then joins the sub-rows beneath it.
        const promoted = extras.find((d) => d.main);
        const subs = extras.filter((d) => !d.main);
        return (
          <div key={p.name} className="mt-0.5">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: p.color }}
                />
                {promoted ? promoted.label : p.name}
              </span>
              <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                {promoted
                  ? promoted.value
                  : p.value == null
                    ? "—"
                    : full(p.value)}
                {contributed != null && row?.n != null && contributed < row.n && (
                  <span className="ml-1 font-normal text-zinc-400">
                    ({contributed} recorded)
                  </span>
                )}
              </span>
            </div>
            {/* Demoted series value + how the headline was reached. */}
            {promoted && (
              <div className="ml-3.5 flex items-center justify-between gap-4 text-xs text-zinc-500">
                <span>{p.name}</span>
                <span className="tabular-nums">
                  {p.value == null ? "—" : full(p.value)}
                </span>
              </div>
            )}
            {subs.map((d) => (
              <div
                key={d.label}
                className="ml-3.5 flex items-center justify-between gap-4 text-xs text-zinc-500"
              >
                <span>{d.label}</span>
                <span className="tabular-nums">{d.value}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A number printed above a point. Recharts hands us the plotted coordinates; we
 * draw a soft chip behind the text so it stays legible where it crosses the
 * grid or the line, and skip any index the thinning didn't select.
 */
function PointLabel(props: {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  index?: number;
  show?: (i: number) => boolean;
  format?: (n: number) => string;
}) {
  const { x, y, value, index, show, format = compact } = props;
  if (typeof x !== "number" || typeof y !== "number" || typeof value !== "number") {
    return null;
  }
  if (index != null && show && !show(index)) return null;

  const text = format(value);
  const w = text.length * 6.1 + 10;
  return (
    <g pointerEvents="none">
      <rect
        x={x - w / 2}
        y={y - 22}
        width={w}
        height={15}
        rx={4}
        className="fill-white/85 dark:fill-zinc-900/85"
      />
      <text
        x={x}
        y={y - 11.5}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        className="fill-zinc-600 tabular-nums dark:fill-zinc-300"
      >
        {text}
      </text>
    </g>
  );
}

/**
 * Which point indices get a label. Every point when they fit; otherwise an even
 * spread (always including the first and last) so labels never collide — a wall
 * of overlapping numbers is worse than no numbers.
 */
function labelIndices(n: number, max = 11): ((i: number) => boolean) | undefined {
  if (n <= max) return undefined; // show all
  const step = (n - 1) / (max - 1);
  const keep = new Set<number>();
  for (let i = 0; i < max; i++) keep.add(Math.round(i * step));
  return (i: number) => keep.has(i);
}

/**
 * The tapped point, written out under the plot. Mobile only, and the single most
 * important thing in this file.
 *
 * Everything that makes these charts honest — the bucket's live count
 * (`· 6 lives`) and the per-series `(2 recorded)` caveat — has lived only in the
 * Recharts tooltip, which is summoned by hovering a 2.5px dot. A thumb has no
 * hover and cannot hit 2.5px, so on a phone the reader has been getting the
 * shape of the data with none of the sample size behind it. On a metric that
 * sits on roughly 19% of lives that is not a missing nicety; it is the
 * difference between a trend and four dots.
 *
 * So the strip renders from `rows[activeIndex]` — the *same row object* the
 * tooltip formats — and the sample-size strings are built the same way in both
 * places. It defaults to the last point rather than to nothing, because an empty
 * box that only fills in once you discover you can tap the chart teaches nobody
 * anything; the newest bucket is also the one an admin is usually here for.
 *
 * A null series value goes through `NotEntered`, not the tooltip's `—`. This is
 * a mobile surface and P1 applies to it: a blank leads bucket is a live nobody
 * has typed into, and a dash beside a date reads as a zero.
 */
function Readout({
  row,
  series,
  detail,
}: {
  row: ChartRow;
  series: Series[];
  detail?: (row: ChartRow, seriesKey: string) => DetailRow[];
}) {
  return (
    // aria-live, because tapping a bar changes text somewhere else on the
    // screen — without it a screen-reader user gets silence for the one
    // interaction this chart has.
    <div
      aria-live="polite"
      className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 lg:hidden dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {String(row.label)}
        {row.n != null && (
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            · {row.n} live{row.n === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {series.map((s) => {
        const value = row[s.key] as number | null | undefined;
        const contributed = row[`${s.key}_n`] as number | undefined;
        const extras = detail ? detail(row, s.key) : [];
        const promoted = extras.find((d) => d.main);
        const subs = extras.filter((d) => !d.main);
        return (
          <div key={s.key} className="mt-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm"
                  style={{ background: s.color }}
                />
                <span className="min-w-0 break-words">
                  {promoted ? promoted.label : s.name}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {promoted ? (
                  promoted.value
                ) : value == null ? (
                  <NotEntered />
                ) : (
                  full(value)
                )}
              </span>
            </div>
            {/* The caveat that used to be hover-only: this bar is drawn from
                fewer lives than the bucket holds. */}
            {!promoted && contributed != null && row.n != null && contributed < row.n && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {contributed} of {row.n} recorded
              </div>
            )}
            {promoted && (
              <div className="ml-3.5 flex items-baseline justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{s.name}</span>
                <span className="shrink-0 tabular-nums">
                  {value == null ? <NotEntered /> : full(value)}
                </span>
              </div>
            )}
            {subs.map((d) => (
              <div
                key={d.label}
                className="ml-3.5 flex items-baseline justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400"
              >
                <span>{d.label}</span>
                <span className="shrink-0 tabular-nums">{d.value}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One chart at a time, below `lg`.
 *
 * `/admin/tiktok/all` stacks six charts and `/admin/tiktok/[id]` seven. At
 * ~230px each that is 1,400–1,600px of scrolling before the tables, on the two
 * pages an admin opens most. A chip strip turns that into one chart plus a row
 * of titles — the largest single vertical saving in the redesign — and costs
 * nothing on desktop, where the strip is `lg:hidden` and every slot goes back to
 * being an ordinary grid item.
 *
 * `lg:contents` is doing that last part: at `lg` the wrapper stops generating a
 * box entirely, so the `ChartCard` inside it is once again a direct child of the
 * grid and keeps its own track and its stretched row height. Wrapping the cards
 * in real divs would have quietly broken equal-height rows on the managers'
 * daily page — a nested div is not free in a grid (P5).
 *
 * Chips carry `aria-pressed` rather than tab semantics: the hidden charts are
 * still in the DOM and still readable in source order by a screen reader, so
 * calling this a tablist would promise a relationship that the markup does not
 * have.
 */
export function ChartChips({
  titles,
  active,
  onSelect,
  label,
}: {
  titles: string[];
  active: number;
  onSelect: (i: number) => void;
  /** Names the strip for screen readers, e.g. "Choose a chart". */
  label: string;
}) {
  return (
    // No negative margin to bleed this to the screen edge, deliberately: this
    // component is dropped into a pane on one page and a `Disclosure` body on
    // another, and a `-mx-4` under a parent that turns out not to pad by 16px
    // is exactly how a page starts scrolling sideways at 375px (P6). The last
    // chip clipping at the container edge is affordance enough that the row
    // scrolls.
    <div
      role="group"
      aria-label={label}
      className="mb-3 flex gap-2 overflow-x-auto pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {titles.map((t, i) => (
        <button
          key={t}
          type="button"
          aria-pressed={i === active}
          onClick={() => onSelect(i)}
          className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            i === active
              ? "border-blue-600 bg-blue-600 text-white active:bg-blue-700"
              : "border-zinc-300 bg-white text-zinc-700 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:active:bg-zinc-800"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/** One chart's place in the deck: shown below `lg` only when its chip is on. */
export function ChartSlot({
  index,
  active,
  children,
}: {
  index: number;
  active: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`${index === active ? "" : "hidden"} lg:contents`}>{children}</div>
  );
}

export function ChartCard({
  title,
  subtitle,
  kind,
  series,
  build,
  sessions,
  defaultAgg,
  emptyHint,
  unit,
  seedAgg,
  aggs = AGGREGATIONS,
  aggLock,
  connectNulls = true,
  dimBelowN,
  footnote,
  average,
  pointLabel,
  detail,
}: {
  title: string;
  subtitle: string;
  kind: "line" | "bar";
  series: Series[];
  build: (s: AnalysisSession[], agg: Agg) => ChartRow[];
  sessions: AnalysisSession[];
  defaultAgg: Agg;
  emptyHint: React.ReactNode;
  unit?: string;
  /** Page-level "Combine by" value; seeds this chart until it's overridden. */
  seedAgg?: Agg;
  /** Restrict the picker (e.g. no SUM for an intrinsic average). */
  aggs?: readonly Agg[];
  /** Fixed label — the value is a pooled rate and cannot be re-aggregated. */
  aggLock?: string;
  /** False leaves gaps for unrecorded days instead of interpolating across them. */
  connectNulls?: boolean;
  /** Fade any bucket whose own contributing count is below this. */
  dimBelowN?: number;
  footnote?: React.ReactNode;
  /**
   * A headline figure for the whole period, shown beside the picker. Its `unit`
   * is mandatory and always rendered: this is a per-DAY figure while some charts
   * plot a per-HOUR line, so the two must never be readable as the same thing.
   */
  average?: { value: number | null; unit: string; title?: string };
  /**
   * Print a number above each point/bar. `dataKey` maps a series key to the
   * column holding the number to show — so a chart can plot a RATE while
   * labelling each point with the underlying total it came from.
   */
  pointLabel?: { dataKey: (seriesKey: string) => string; format?: (n: number) => string };
  /** Extra rows under each series in the tooltip (e.g. the totals behind a rate). */
  detail?: (row: ChartRow, seriesKey: string) => DetailRow[];
}) {
  // A local override that self-clears whenever the page-level seed changes —
  // equivalent to syncing in an effect, without the extra render or the
  // set-state-in-effect lint rule.
  const [override, setOverride] = useState<{ seed?: Agg; agg: Agg } | null>(null);
  const agg =
    override && override.seed === seedAgg ? override.agg : (seedAgg ?? defaultAgg);

  const rows = useMemo(() => build(sessions, agg), [build, sessions, agg]);
  const hasData = rows.some((r) => series.some((s) => r[s.key] != null));

  const narrow = useIsNarrow();

  // The tapped point, stored beside the rows it indexes into. Changing the date
  // range or the aggregation builds a new `rows` array, and index 4 of the old
  // one is not index 4 of the new one — pinning the identity here lets a stale
  // selection fall away on its own, the same trick `override` uses above.
  const [picked, setPicked] = useState<{ rows: ChartRow[]; index: number } | null>(null);
  const activeIndex = picked && picked.rows === rows ? picked.index : null;
  const readoutRow = rows[activeIndex ?? rows.length - 1];

  // Recharts hands the tapped bucket back on its own public click argument, so
  // nothing here reaches into the tooltip's internal store. It types that index
  // as `number | string | null`, and v3 does deliver the string form, so parse
  // rather than assume — a silently-ignored tap would look exactly like a chart
  // that does not respond to touch, which is the bug we are fixing.
  const onChartClick = (state: { activeTooltipIndex?: number | string | null }) => {
    const raw = state?.activeTooltipIndex;
    const i = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    setPicked(
      typeof i === "number" && Number.isInteger(i) && i >= 0 && i < rows.length
        ? { rows, index: i }
        : null
    );
  };

  // 240 → 200 and a 52px y-gutter → 36px: on a ~340px card the axis label
  // column was eating a sixth of the width to print "8.4k".
  const height = narrow ? 200 : 240;
  const axis = { fill: AXIS, fontSize: narrow ? 12 : 11 };
  const xProps = {
    dataKey: "label",
    tick: axis,
    tickLine: false,
    axisLine: { stroke: GRID },
    // Bars normally label every bucket. On a ~270px plot the six part-of-day
    // labels rotate into an unreadable band and the 24-hour charts are worse, so
    // below `lg` both kinds thin out and sit upright instead. Fewer honest ticks
    // beat a complete set nobody can read.
    interval: narrow
      ? ("preserveStartEnd" as const)
      : kind === "bar"
        ? (0 as const)
        : ("preserveStartEnd" as const),
    angle: narrow ? 0 : -25,
    textAnchor: narrow ? ("middle" as const) : ("end" as const),
    height: narrow ? 24 : 48,
  };
  const yProps = {
    tick: axis,
    tickLine: false,
    axisLine: false,
    width: narrow ? 36 : 52,
    tickFormatter: compact,
  };

  /** Opacity for one bucket of one series — faded when built from too few lives. */
  const cellOpacity = (row: ChartRow, key: string) =>
    dimBelowN != null && ((row[`${key}_n`] as number) ?? 0) < dimBelowN ? 0.35 : 1;

  // Several charts now ship no subtitle at all — the ones whose subtitle only
  // rephrased their own title. The unit suffix survives on its own, because it
  // is the one thing that keeps a per-HOUR line from being read as a per-DAY
  // figure, so the two are joined rather than concatenated blindly.
  const meta = [subtitle, unit].filter(Boolean).join(" · ");

  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {meta && <p className="text-xs text-zinc-500">{meta}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* The null case drops the chip entirely below `lg` rather than
              printing "Avg — views/day". A dash on a mobile surface is the one
              thing P1 forbids, and there is nothing here to say instead: this
              average has no value because no day in range carried the number. */}
          {average && (average.value != null || !narrow) && (
            <span
              // A native `title` has no touch equivalent, so below `lg` it is
              // dead weight that only lends the chip a misleading cursor. The
              // sentence itself is not lost: the strip under the plot says the
              // same thing with real numbers in it.
              title={
                narrow
                  ? undefined
                  : (average.title ??
                    `Average per day that had a live, across the selected dates. Measured in ${average.unit}.`)
              }
              className="whitespace-nowrap rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-zinc-600 lg:cursor-help dark:bg-zinc-900 dark:text-zinc-300"
            >
              Avg{" "}
              {average.value == null ? "—" : average.value.toLocaleString("en-MY")}{" "}
              <span className="font-normal text-zinc-400">{average.unit}</span>
            </span>
          )}
          {aggLock ? (
            // Below `lg` there is no picker to explain — the chip existed to say
            // why this one chart has none, and a label whose only content is the
            // absence of a control it sits beside is worth more room than it
            // costs on a 375px header.
            !narrow && (
              <span
                title="Rates are always worked out from the period totals, so they can't be re-combined."
                className="cursor-help whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              >
                {aggLock}
              </span>
            )
          ) : (
            <select
              value={agg}
              onChange={(e) => setOverride({ seed: seedAgg, agg: e.target.value as Agg })}
              aria-label={`How to combine ${title}`}
              // 44px and 16px text on a phone: at its desktop size this is a
              // ~20px target carrying 11px text, which iOS both zooms into on
              // focus and mostly refuses to hit. `lg:` puts every one of those
              // numbers back exactly as it is today.
              className="h-11 shrink-0 rounded-md border border-zinc-300 bg-white px-2 text-base font-medium text-zinc-700 lg:h-auto lg:px-1 lg:py-0.5 lg:text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {aggs.map((a) => (
                <option key={a} value={a}>
                  {AGG_LABEL[a]}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!hasData ? (
        <div
          style={{ height }}
          className="grid place-items-center rounded-lg border border-dashed border-zinc-300 px-6 text-center text-xs text-zinc-500 dark:border-zinc-700"
        >
          {emptyHint}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {kind === "line" ? (
            // Extra head-room when points carry a number label, so it can't clip.
            <LineChart
              data={rows}
              onClick={onChartClick}
              margin={{
                top: pointLabel && !narrow ? 20 : 6,
                right: 10,
                bottom: 0,
                left: -8,
              }}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis {...xProps} />
              <YAxis {...yProps} />
              <Tooltip
                content={<ChartTooltip rows={rows} detail={detail} />}
                cursor={{ stroke: GRID, strokeWidth: 1 }}
                trigger={narrow ? "click" : "hover"}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: narrow ? 12 : 11 }} />}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 2.5, strokeWidth: 0, fill: s.color }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                  connectNulls={connectNulls}
                >
                  {/* Labels only on a single line — several labelled series
                      would overlap into noise. Below `lg` they go entirely:
                      eleven ~35px chips will not fit across a ~270px plot, and
                      the strip under the chart now gives that number in full on
                      demand. */}
                  {pointLabel && series.length === 1 && !narrow && (
                    <LabelList
                      dataKey={pointLabel.dataKey(s.key)}
                      content={
                        <PointLabel
                          show={labelIndices(rows.length)}
                          format={pointLabel.format}
                        />
                      }
                    />
                  )}
                </Line>
              ))}
            </LineChart>
          ) : (
            <BarChart
              data={rows}
              onClick={onChartClick}
              margin={{ top: 6, right: 10, bottom: 0, left: -8 }}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis {...xProps} />
              <YAxis {...yProps} />
              {/* cursor={false} → hovering highlights only the bar, never a grey
                  band behind it. */}
              <Tooltip
                content={<ChartTooltip rows={rows} detail={detail} />}
                cursor={false}
                trigger={narrow ? "click" : "hover"}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: narrow ? 12 : 11 }} />}
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={s.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                  activeBar={{ fill: s.color, fillOpacity: 0.75 }}
                >
                  {dimBelowN != null &&
                    rows.map((r) => (
                      <Cell
                        key={`${s.key}-${r.label}`}
                        fill={s.color}
                        fillOpacity={cellOpacity(r, s.key)}
                      />
                    ))}
                </Bar>
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}

      {hasData && narrow && readoutRow && (
        <Readout row={readoutRow} series={series} detail={detail} />
      )}

      {footnote && (
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">{footnote}</p>
      )}
    </div>
  );
}
