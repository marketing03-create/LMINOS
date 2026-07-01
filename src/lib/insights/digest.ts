/**
 * Weekly performance digest + simple anomaly flags. Pure compute — the caller
 * decides whether to send it (cron → Telegram) or just print it (preview).
 */
import type { DateRange } from "@/lib/roas/aggregate";
import { topLineMetrics } from "@/lib/roas/aggregate";
import { adAccountSummaries } from "@/lib/ads/account-metrics";
import { fmtMyr, fmtRoas } from "@/lib/roas/metrics";

export type DigestData = {
  text: string;
  alerts: string[];
};

function lastNDays(days: number, endDaysAgo = 0): DateRange {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1 - endDaysAgo); // exclusive, include today
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { start, end };
}

function pctDelta(now: number, prev: number): string {
  if (prev === 0) return now > 0 ? "▲ new" : "—";
  const d = ((now - prev) / prev) * 100;
  const arrow = d > 1 ? "▲" : d < -1 ? "▼" : "→";
  return `${arrow} ${Math.abs(d).toFixed(0)}%`;
}

export async function buildWeeklyDigest(): Promise<DigestData> {
  const thisWeek = lastNDays(7, 0);
  const lastWeek = lastNDays(7, 7);

  const [now, prev, accounts] = await Promise.all([
    topLineMetrics(thisWeek),
    topLineMetrics(lastWeek),
    adAccountSummaries(thisWeek),
  ]);

  const approvedNow = now.approved + now.closed;
  const lines: string[] = [];
  lines.push("📊 LMIROS — weekly summary (last 7 days)");
  lines.push("");
  lines.push(`Spend: ${fmtMyr(now.spend)}  (${pctDelta(now.spend, prev.spend)} vs prior wk)`);
  lines.push(`Leads: ${now.leads}  (${pctDelta(now.leads, prev.leads)})`);
  lines.push(`Clicks: ${now.clicks}  ·  Platform conv: ${Math.round(now.platformConversions)}`);
  lines.push(`Approved sales: ${approvedNow}  ·  Revenue: ${fmtMyr(now.revenue)}`);
  lines.push(`Real ROAS: ${fmtRoas(now.realRoas)}  (${pctDelta(now.realRoas ?? 0, prev.realRoas ?? 0)})`);

  if (accounts.length > 0) {
    lines.push("");
    lines.push("By ad account:");
    for (const a of accounts.filter((x) => x.spend > 0 || x.impressions > 0)) {
      lines.push(
        `• ${a.displayName}: ${fmtMyr(a.spend)} · ${a.clicks} clicks · ${Math.round(a.conversions)} conv`
      );
    }
  }

  // ── Anomaly flags ──
  const alerts: string[] = [];
  for (const a of accounts) {
    if (a.spend >= 50 && a.conversions === 0) {
      alerts.push(`${a.displayName}: spent ${fmtMyr(a.spend)} with 0 platform conversions this week.`);
    }
  }
  if (prev.spend > 0 && now.spend > prev.spend * 1.25 && now.leads < prev.leads) {
    alerts.push(`Spend up ${pctDelta(now.spend, prev.spend)} but leads are down — check efficiency.`);
  }
  if (now.spend >= 100 && now.realRoas != null && now.realRoas < 0.5) {
    alerts.push(`Real ROAS is low (${fmtRoas(now.realRoas)}) on ${fmtMyr(now.spend)} spend — revenue may be under-recorded or campaigns underperforming.`);
  }

  if (alerts.length > 0) {
    lines.push("");
    lines.push("⚠️ Alerts:");
    for (const a of alerts) lines.push(`• ${a}`);
  }

  return { text: lines.join("\n"), alerts };
}
