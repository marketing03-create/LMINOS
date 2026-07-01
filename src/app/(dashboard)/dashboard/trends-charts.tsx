"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/roas/trends";

const AXIS = "#9aa6c8";
const GRID = "#27272a";

function fmtDay(d: unknown): string {
  // 2026-06-04 → Jun 4
  const s = String(d ?? "");
  const [, m, day] = s.split("-");
  if (!m || !day) return s;
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m)] ?? m} ${Number(day)}`;
}

const tooltipStyle = {
  backgroundColor: "#0f1730",
  border: "1px solid #2a3760",
  borderRadius: 8,
  fontSize: 12,
  color: "#e8ecf8",
};

export function TrendsCharts({ data }: { data: TrendPoint[] }) {
  return (
    <div className="space-y-8">
      <ChartCard title="Spend vs. Leads" subtitle="Are we paying more and getting more leads?">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: AXIS, fontSize: 11 }} minTickGap={20} />
            <YAxis yAxisId="l" tick={{ fill: AXIS, fontSize: 11 }} width={48} />
            <YAxis yAxisId="r" orientation="right" tick={{ fill: AXIS, fontSize: 11 }} width={36} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDay} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="spend" name="Spend (RM)" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            <Line yAxisId="r" dataKey="leads" name="Leads" stroke="#22c55e" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Clicks &amp; Conversions" subtitle="Engagement and platform-reported conversions over time">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: AXIS, fontSize: 11 }} minTickGap={20} />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} width={40} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDay} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="clicks" name="Clicks" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line dataKey="conversions" name="Platform conv." stroke="#ec4899" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Impressions" subtitle="Reach over time">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: AXIS, fontSize: 11 }} minTickGap={20} />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} width={48} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDay} />
            <Line dataKey="impressions" name="Impressions" stroke="#06b6d4" strokeWidth={2} dot={false} />
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
        <h3 className="text-sm font-semibold" dangerouslySetInnerHTML={{ __html: title }} />
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
