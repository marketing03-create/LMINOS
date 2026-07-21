import { fmtInt } from "@/lib/roas/metrics";
import type { TikTokKpis } from "@/lib/tiktok-live/queries";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";

/**
 * The 9 TikTok Live KPI cards, each with a "?" explaining what the number
 * means. Shared by the operations + admin TikTok Live pages so the metrics and
 * their explanations stay identical everywhere.
 */
const CARDS: {
  key: keyof TikTokKpis;
  label: string;
  help: string;
  raw?: boolean;
}[] = [
  { key: "sessions", label: "Sessions", help: METRIC_HELP.sessions },
  { key: "totalLeads", label: "Total leads", help: METRIC_HELP.totalLeads },
  { key: "leads", label: "Comment leads", help: METRIC_HELP.commentLeads },
  { key: "totalViews", label: "Total views", help: METRIC_HELP.views },
  { key: "newFollowers", label: "New followers", help: METRIC_HELP.followers },
  {
    key: "avgPeakViewers",
    label: "Avg peak viewers",
    help: `Average of each live's peak. ${METRIC_HELP.peak}`,
  },
  { key: "totalLikes", label: "Likes", help: METRIC_HELP.likes },
  { key: "totalComments", label: "Comments", help: METRIC_HELP.comments },
  { key: "totalShares", label: "Shares", help: METRIC_HELP.shares },
  {
    key: "liveHours",
    label: "Live hours",
    help: METRIC_HELP.liveHours,
    raw: true, // already a formatted number (e.g. 7.2)
  },
];

export function TikTokKpiCards({ kpis }: { kpis: TikTokKpis }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-10">
      {CARDS.map((c) => (
        <div
          key={c.key}
          className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-zinc-950"
        >
          <div className="flex items-start justify-between gap-1">
            <div className="text-xs uppercase tracking-wider text-zinc-500">{c.label}</div>
            <HelpTip text={c.help} label={`About ${c.label}`} />
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {c.raw ? String(kpis[c.key]) : fmtInt(kpis[c.key])}
          </div>
        </div>
      ))}
    </div>
  );
}
