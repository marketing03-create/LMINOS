"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HeatCell } from "@/lib/roas/hourly";

type Metric = "clicks" | "impressions" | "conversions";
type DayFilter = "all" | "weekday" | "weekend";

const METRICS: { key: Metric; label: string }[] = [
  { key: "clicks", label: "Clicks" },
  { key: "impressions", label: "Impressions" },
  { key: "conversions", label: "Conversions" },
];

const DAY_FILTERS: { key: DayFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "weekday", label: "Weekday" },
  { key: "weekend", label: "Weekend" },
];

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [6, 0];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const WEEKDAY_COLOR = "#3b82f6";
const WEEKEND_COLOR = "#22c55e";

function hourLabel(h: number): string {
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ap}`;
}

const tooltipStyle = {
  backgroundColor: "#0f1730",
  border: "1px solid #2a3760",
  borderRadius: 8,
  fontSize: 12,
  color: "#e8ecf8",
  padding: "6px 10px",
};

export function HourlyHeatmap({ cells }: { cells: HeatCell[] }) {
  const [metric, setMetric] = useState<Metric>("clicks");
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");

  const { weekdayAvg, weekendAvg, peakWeekday, peakWeekend, total } = useMemo(
    () => computeView(cells, metric),
    [cells, metric]
  );

  if (total === 0) {
    return (
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-6 text-sm text-zinc-500">
        No hourly data yet. Run <code className="text-xs">npm run gads:sync-hourly</code>{" "}
        (or the daily hourly cron) to populate this.
      </div>
    );
  }

  const metricLabel = METRICS.find((m) => m.key === metric)!.label;
  const showWeekday = dayFilter !== "weekend";
  const showWeekend = dayFilter !== "weekday";

  // One row per hour with the avg weekday + weekend value (weekday sum / 5,
  // weekend sum / 2 — comparable per-day averages). Drives both charts.
  const hourData = HOURS.map((h) => ({
    label: hourLabel(h),
    Weekday: round(weekdayAvg[h]),
    Weekend: round(weekendAvg[h]),
  }));

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4">
      <div className="mb-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Best time of day</h3>
          <p className="text-xs text-zinc-500">
            When customers engage, by hour &amp; weekday (account timezone, Malaysia).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={dayFilter}
            onChange={(e) => setDayFilter(e.target.value as DayFilter)}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-300"
          >
            {DAY_FILTERS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`px-2.5 py-1 text-xs rounded-md transition ${
                  metric === m.key
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Peak callout */}
      <div className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
        <span className="font-semibold">Peak</span> ({metricLabel.toLowerCase()}) —{" "}
        <span className="font-medium">Weekdays:</span> {peakWeekday ?? "—"} ·{" "}
        <span className="font-medium">Weekends:</span> {peakWeekend ?? "—"}
      </div>

      {/* Top: average metric by hour (bars) */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Average {metricLabel.toLowerCase()} per day, by hour
          </h4>
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            {showWeekday && <LegendDot color={WEEKDAY_COLOR} label="Weekday" />}
            {showWeekend && <LegendDot color={WEEKEND_COLOR} label="Weekend" />}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={hourData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#9aa6c8", fontSize: 10 }} interval={1} />
            <YAxis tick={{ fill: "#9aa6c8", fontSize: 11 }} width={44} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(120,120,135,0.1)" }} />
            {showWeekday && <Bar dataKey="Weekday" fill={WEEKDAY_COLOR} radius={[2, 2, 0, 0]} />}
            {showWeekend && <Bar dataKey="Weekend" fill={WEEKEND_COLOR} radius={[2, 2, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom: same data as a smooth hourly line — every hour visible */}
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            {metricLabel} by hour — weekday vs weekend
          </h4>
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            {showWeekday && <LegendDot color={WEEKDAY_COLOR} label="Weekday" />}
            {showWeekend && <LegendDot color={WEEKEND_COLOR} label="Weekend" />}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={hourData} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#9aa6c8", fontSize: 10 }} interval={1} />
            <YAxis tick={{ fill: "#9aa6c8", fontSize: 11 }} width={44} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#3f3f46" }} />
            {showWeekday && (
              <Line
                type="monotone"
                dataKey="Weekday"
                stroke={WEEKDAY_COLOR}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showWeekend && (
              <Line
                type="monotone"
                dataKey="Weekend"
                stroke={WEEKEND_COLOR}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-zinc-500 mt-1">
          Every hour of the day (12am → 11pm). Hover any point for the exact value.
        </p>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function computeView(cells: HeatCell[], metric: Metric) {
  const grid: Record<number, Record<number, number>> = {};
  let total = 0;
  for (const c of cells) {
    const v = c[metric];
    (grid[c.dow] ??= {})[c.hour] = v;
    total += v;
  }

  // Average per day-type: weekday sum / 5, weekend / 2 (fair comparison).
  const weekdayAvg = new Array(24).fill(0);
  const weekendAvg = new Array(24).fill(0);
  for (const h of HOURS) {
    let wd = 0;
    let we = 0;
    for (const d of WEEKDAYS) wd += grid[d]?.[h] ?? 0;
    for (const d of WEEKEND) we += grid[d]?.[h] ?? 0;
    weekdayAvg[h] = wd / WEEKDAYS.length;
    weekendAvg[h] = we / WEEKEND.length;
  }

  return {
    total,
    weekdayAvg,
    weekendAvg,
    peakWeekday: peakWindow(weekdayAvg),
    peakWeekend: peakWindow(weekendAvg),
  };
}

/**
 * Name the busiest window: the peak hour plus the contiguous band within 85% of
 * it. If demand is a broad plateau (band > 6h), just report the single peak hour
 * so the callout stays honest and crisp (e.g. "9pm" not "2pm–11pm").
 */
function peakWindow(byHour: number[]): string | null {
  let peak = 0;
  let peakV = 0;
  for (let h = 0; h < 24; h++) {
    if (byHour[h] > peakV) {
      peakV = byHour[h];
      peak = h;
    }
  }
  if (peakV <= 0) return null;
  const thresh = peakV * 0.85;
  let a = peak;
  let b = peak;
  while (a - 1 >= 0 && byHour[a - 1] >= thresh) a--;
  while (b + 1 <= 23 && byHour[b + 1] >= thresh) b++;
  if (a === b || b - a > 6) return hourLabel(peak);
  return `${hourLabel(a)}–${hourLabel(b)} (peak ${hourLabel(peak)})`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
