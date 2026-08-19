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

/**
 * The shared chart tile: one chart plus its own Total/Average/Min/Max/Count/
 * Median picker. Extracted from live-analysis-charts.tsx so the Overview can
 * reuse the exact same visual language rather than growing a second one.
 *
 * Beyond the original it can: seed its picker from a page-level control, offer a
 * restricted set of aggregations (a SUM of per-live averages is meaningless),
 * lock the picker entirely (a pooled rate is always sum÷sum), leave gaps where
 * a metric was never recorded, and fade buckets built from too few lives.
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
              <div className="ml-3.5 flex items-center justify-between gap-4 text-[11px] text-zinc-500">
                <span>{p.name}</span>
                <span className="tabular-nums">
                  {p.value == null ? "—" : full(p.value)}
                </span>
              </div>
            )}
            {subs.map((d) => (
              <div
                key={d.label}
                className="ml-3.5 flex items-center justify-between gap-4 text-[11px] text-zinc-500"
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

  const axis = { fill: AXIS, fontSize: 11 };
  const xProps = {
    dataKey: "label",
    tick: axis,
    tickLine: false,
    axisLine: { stroke: GRID },
    interval: kind === "bar" ? (0 as const) : ("preserveStartEnd" as const),
    angle: -25,
    textAnchor: "end" as const,
    height: 48,
  };
  const yProps = {
    tick: axis,
    tickLine: false,
    axisLine: false,
    width: 52,
    tickFormatter: compact,
  };

  /** Opacity for one bucket of one series — faded when built from too few lives. */
  const cellOpacity = (row: ChartRow, key: string) =>
    dimBelowN != null && ((row[`${key}_n`] as number) ?? 0) < dimBelowN ? 0.35 : 1;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-[11px] text-zinc-500">
            {subtitle}
            {unit ? ` · ${unit}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {average && (
            <span
              title={
                average.title ??
                `Average per day that had a live, across the selected dates. Measured in ${average.unit}.`
              }
              className="cursor-help whitespace-nowrap rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            >
              Avg{" "}
              {average.value == null ? "—" : average.value.toLocaleString("en-MY")}{" "}
              <span className="font-normal text-zinc-400">{average.unit}</span>
            </span>
          )}
          {aggLock ? (
            <span
              title="Rates are always worked out from the period totals, so they can't be re-combined."
              className="cursor-help whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
            >
              {aggLock}
            </span>
          ) : (
            <select
              value={agg}
              onChange={(e) => setOverride({ seed: seedAgg, agg: e.target.value as Agg })}
              aria-label={`How to combine ${title}`}
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-1 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
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
        <div className="grid h-[240px] place-items-center rounded-lg border border-dashed border-zinc-300 px-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
          {emptyHint}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          {kind === "line" ? (
            // Extra head-room when points carry a number label, so it can't clip.
            <LineChart
              data={rows}
              margin={{ top: pointLabel ? 20 : 6, right: 10, bottom: 0, left: -8 }}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis {...xProps} />
              <YAxis {...yProps} />
              <Tooltip
                content={<ChartTooltip rows={rows} detail={detail} />}
                cursor={{ stroke: GRID, strokeWidth: 1 }}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
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
                      would overlap into noise. */}
                  {pointLabel && series.length === 1 && (
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
            <BarChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis {...xProps} />
              <YAxis {...yProps} />
              {/* cursor={false} → hovering highlights only the bar, never a grey
                  band behind it. */}
              <Tooltip content={<ChartTooltip rows={rows} detail={detail} />} cursor={false} />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
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

      {footnote && (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{footnote}</p>
      )}
    </div>
  );
}
