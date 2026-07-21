"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/tiktok-live/queries";
import { HelpTip } from "@/components/help-tip";

const AXIS = "#9aa6c8";
const GRID = "#27272a";
const tooltipStyle = {
  backgroundColor: "#0f1730",
  border: "1px solid #2a3760",
  borderRadius: 8,
  fontSize: 12,
  color: "#e8ecf8",
};

type Series = { key: string; name: string; color: string; dot: boolean };

const CHARTS: {
  key: string;
  title: string;
  subtitle: string;
  help: string;
  lines: Series[];
}[] = [
  {
    key: "viewers",
    title: "Total viewers per session",
    subtitle: "Total people who watched each live (cumulative reach)",
    help: "Each point is one live. “Total viewers” = everyone who watched that live (TikTok's “Views”). Captured live by our own connector, so it runs a few % under TikTok's own final tally.",
    lines: [{ key: "totalViewers", name: "Total viewers", color: "#22d3ee", dot: true }],
  },
  {
    key: "engagement",
    title: "Engagement per session",
    subtitle: "Likes, comments and shares, each live",
    help: "Each point is one live, showing its likes, comments and shares. Captured live, so totals run a few % under TikTok's own final tally.",
    lines: [
      { key: "likes", name: "Likes", color: "#f59e0b", dot: false },
      { key: "comments", name: "Comments", color: "#ec4899", dot: false },
      { key: "shares", name: "Shares", color: "#22c55e", dot: false },
    ],
  },
];

function Chart({ data, lines, height }: { data: TrendPoint[]; lines: Series[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 10 }} minTickGap={24} />
        <YAxis tick={{ fill: AXIS, fontSize: 11 }} width={48} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => (
          <Line
            key={l.key}
            dataKey={l.key}
            name={l.name}
            stroke={l.color}
            strokeWidth={2}
            dot={l.dot ? { r: 3 } : false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * The two trend charts, side-by-side on desktop (stacked on mobile) to save
 * vertical space, each with an expand button that opens a large full-width view.
 */
export function TikTokCharts({ data }: { data: TrendPoint[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Lock body scroll + close on Escape while the modal is open.
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(null);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const active = CHARTS.find((c) => c.key === expanded) ?? null;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {CHARTS.map((c) => (
          <div
            key={c.key}
            className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{c.title}</h3>
                <p className="text-xs text-zinc-500">{c.subtitle}</p>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <HelpTip text={c.help} label={`About ${c.title}`} />
                <button
                  onClick={() => setExpanded(c.key)}
                  aria-label={`Expand ${c.title}`}
                  title="Expand"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
              </div>
            </div>
            <Chart data={data} lines={c.lines} height={240} />
          </div>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setExpanded(null)}
        >
          <div
            className="w-full max-w-5xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{active.title}</h3>
                <p className="text-xs text-zinc-500">{active.subtitle}</p>
              </div>
              <button
                onClick={() => setExpanded(null)}
                aria-label="Close"
                className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <Chart data={data} lines={active.lines} height={460} />
          </div>
        </div>
      )}
    </>
  );
}
