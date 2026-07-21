"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  dmsByDate,
  durationByDate,
  leadsByHour,
  leadsByProduct,
  viewsByDate,
  viewsByHour,
  watchByDate,
  type Agg,
  type AnalysisSession,
  type ChartRow,
} from "@/lib/tiktok-live/live-analysis-core";

const BLUE = "#3b82f6";
const RED = "#ef4444";
const AXIS = "#8b93a7";
const GRID = "rgba(148,163,184,0.18)";

/** Compact axis ticks — 8 400 → "8.4k", so a 4-digit label can't get clipped. */
function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n * 10) / 10);
}
const full = (n: number) => n.toLocaleString("en-MY");

type Series = { key: string; name: string; color: string };

/** Shared dark-on-light-and-dark tooltip; values formatted in full. */
function ChartTooltip({
  active,
  payload,
  label,
  rows,
}: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string }[];
  label?: string | number;
  rows: ChartRow[];
}) {
  if (!active || !payload?.length) return null;
  const n = rows.find((r) => r.label === label)?.n;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
      <div className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">
        {String(label)}
        {n != null && (
          <span className="ml-1 font-normal text-zinc-500">
            · {n} live{n === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: p.color }}
            />
            {p.name}
          </span>
          <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
            {p.value == null ? "—" : full(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One chart + its own Total/Average/Min/Max/Count/Median picker. */
function ChartCard({
  title,
  subtitle,
  kind,
  series,
  build,
  sessions,
  defaultAgg,
  emptyHint,
  unit,
}: {
  title: string;
  subtitle: string;
  kind: "line" | "bar";
  series: Series[];
  build: (s: AnalysisSession[], agg: Agg) => ChartRow[];
  sessions: AnalysisSession[];
  defaultAgg: Agg;
  emptyHint: string;
  unit?: string;
}) {
  const [agg, setAgg] = useState<Agg>(defaultAgg);
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
        <select
          value={agg}
          onChange={(e) => setAgg(e.target.value as Agg)}
          aria-label={`How to combine ${title}`}
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {AGGREGATIONS.map((a) => (
            <option key={a} value={a}>
              {AGG_LABEL[a]}
            </option>
          ))}
        </select>
      </div>

      {!hasData ? (
        <div className="grid h-[240px] place-items-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
          No data yet — {emptyHint}.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          {kind === "line" ? (
            <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis {...xProps} />
              <YAxis {...yProps} />
              <Tooltip
                content={<ChartTooltip rows={rows} />}
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
                  connectNulls
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis {...xProps} />
              <YAxis {...yProps} />
              {/* cursor={false} → hovering highlights only the bar, never a grey
                  band behind it. */}
              <Tooltip content={<ChartTooltip rows={rows} />} cursor={false} />
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
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}

const LEADS: Series[] = [
  { key: "totalLeads", name: "Total Leads", color: BLUE },
  { key: "filteredLeads", name: "Filtered Leads", color: RED },
];

export function LiveAnalysisCharts({ sessions }: { sessions: AnalysisSession[] }) {
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
        emptyHint="needs lives with a recorded duration"
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
        emptyHint="needs lives with views recorded"
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
        emptyHint="needs lives with Avg watch (sec) keyed in"
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
        emptyHint="needs lives with DMs keyed in"
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
        emptyHint="needs lives with views recorded"
      />
      <ChartCard
        title="Product vs Total Leads & Filtered Leads"
        subtitle="Leads per product"
        kind="bar"
        series={LEADS}
        build={leadsByProduct}
        sessions={sessions}
        defaultAgg="SUM"
        emptyHint="needs lives with a product tag and leads keyed in"
      />
      <ChartCard
        title="Live Session Time"
        subtitle="By time of day — which slot converts best"
        kind="bar"
        series={LEADS}
        build={leadsByHour}
        sessions={sessions}
        defaultAgg="AVG"
        emptyHint="needs lives with leads keyed in"
      />
    </div>
  );
}
