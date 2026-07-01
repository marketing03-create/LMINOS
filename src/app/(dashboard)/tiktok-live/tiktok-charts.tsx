"use client";

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

const AXIS = "#9aa6c8";
const GRID = "#27272a";
const tooltipStyle = {
  backgroundColor: "#0f1730",
  border: "1px solid #2a3760",
  borderRadius: 8,
  fontSize: 12,
  color: "#e8ecf8",
};

export function TikTokCharts({ data }: { data: TrendPoint[] }) {
  return (
    <div className="space-y-8">
      <ChartCard title="Total viewers per session" subtitle="Total people who watched each live (cumulative reach)">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 10 }} minTickGap={24} />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} width={48} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="totalViewers" name="Total viewers" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Engagement per session" subtitle="Likes, comments and shares, each live">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 10 }} minTickGap={24} />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} width={48} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="likes" name="Likes" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line dataKey="comments" name="Comments" stroke="#ec4899" strokeWidth={2} dot={false} />
            <Line dataKey="shares" name="Shares" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
