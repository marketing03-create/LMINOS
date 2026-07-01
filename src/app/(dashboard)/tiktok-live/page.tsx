import Link from "next/link";
import { rangeFromParams } from "@/lib/ads/account-metrics";
import {
  tiktokLiveKpis,
  tiktokLiveSessionList,
  tiktokLiveTrend,
  type SessionRow,
  type TikTokKpis,
  type TrendPoint,
} from "@/lib/tiktok-live/queries";
import { fmtInt } from "@/lib/roas/metrics";
import { DateFilter } from "@/components/date-filter";
import { TikTokCharts } from "./tiktok-charts";

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Nullable metric → "—" until it's entered (manual TikTok-backend numbers). */
function fmtN(v: number | null): string {
  return v == null ? "—" : fmtInt(v);
}

export default async function TikTokLivePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const choice = rangeFromParams(sp);

  let kpis: TikTokKpis | null = null;
  let sessions: SessionRow[] = [];
  let trend: TrendPoint[] = [];
  let error: string | null = null;
  try {
    kpis = await tiktokLiveKpis(choice.range);
    sessions = await tiktokLiveSessionList(choice.range);
    trend = await tiktokLiveTrend(choice.range);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">TikTok Live</h1>
          <p className="mt-1 text-sm text-zinc-500">
            LIVE session performance — viewers, likes, comments, shares per stream.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/admin/tiktok/screenshots"
            className="shrink-0 inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Import LIVE screenshots →
          </Link>
          <DateFilter basePath="/tiktok-live" choice={choice} />
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          <Kpi label="Sessions" value={fmtInt(kpis.sessions)} />
          <Kpi label="Leads" value={fmtInt(kpis.leads)} />
          <Kpi label="Total views" value={fmtInt(kpis.totalViews)} />
          <Kpi label="New followers" value={fmtInt(kpis.newFollowers)} />
          <Kpi label="Avg peak viewers" value={fmtInt(kpis.avgPeakViewers)} />
          <Kpi label="Likes" value={fmtInt(kpis.totalLikes)} />
          <Kpi label="Comments" value={fmtInt(kpis.totalComments)} />
          <Kpi label="Shares" value={fmtInt(kpis.totalShares)} />
          <Kpi label="Live hours" value={kpis.liveHours.toString()} />
        </div>
      )}

      {trend.length > 0 ? (
        <div className="mb-8">
          <TikTokCharts data={trend} />
        </div>
      ) : (
        !error && (
          <div className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
            No live sessions in this period. Register handles on{" "}
            <a href="/admin/tiktok" className="underline">
              TikTok Live admin
            </a>{" "}
            and connect a vendor to start pulling data.
          </div>
        )
      )}

      {sessions.length > 0 && (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
              <tr>
                <Th>When</Th>
                <Th>Handle</Th>
                <Th>Title</Th>
                <Th className="text-right">Duration</Th>
                <Th className="text-right">Views</Th>
                <Th className="text-right">Peak</Th>
                <Th className="text-right">Avg</Th>
                <Th className="text-right">Followers</Th>
                <Th className="text-right">Likes</Th>
                <Th className="text-right">Comments</Th>
                <Th className="text-right">Shares</Th>
                <Th className="text-right">Unique</Th>
                <Th className="text-right">Active</Th>
                <Th className="text-right">Watch</Th>
                <Th className="text-right">DMs</Th>
                <Th className="text-right">Bio views</Th>
                <Th className="text-right">Interested</Th>
                <Th className="text-right">Diamonds</Th>
                <Th className="text-right">Leads</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <Td className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                    <Link href={`/tiktok-live/${s.id}`} className="hover:underline">
                      {s.startedAt
                        ? new Date(s.startedAt).toLocaleString("en-MY", { hour12: false })
                        : "—"}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">@{s.handle}</Td>
                  <Td className="max-w-[220px] truncate">{s.title ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{fmtDuration(s.durationSeconds)}</Td>
                  <Td className="text-right tabular-nums">{fmtInt(s.totalViews)}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">{fmtInt(s.peakViewers)}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">{fmtInt(s.avgViewers)}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">{fmtInt(s.newFollowers ?? 0)}</Td>
                  <Td className="text-right tabular-nums">{fmtInt(s.totalLikes)}</Td>
                  <Td className="text-right tabular-nums">{fmtInt(s.totalComments)}</Td>
                  <Td className="text-right tabular-nums">{fmtInt(s.totalShares)}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.uniqueViewers)}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.activeViewers)}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">
                    {s.avgWatchSeconds == null ? "—" : `${s.avgWatchSeconds}s`}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.directMessages)}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.serviceBioViews)}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.interestedViewers)}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.diamonds)}</Td>
                  <Td className="text-right tabular-nums font-medium">
                    <Link href={`/tiktok-live/${s.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                      {fmtInt(s.keywordLeads)}
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sessions.length > 0 && (
        <p className="mt-3 text-xs text-zinc-400">
          Views = total entries during the live (TikTok&apos;s &ldquo;Views&rdquo;). Peak / Avg ={" "}
          people watching at the same time. Captured live by our own connector, so totals run a few
          % under TikTok&apos;s own final tally. The last columns (Unique, Active, Watch, DMs, Bio
          views, Interested, Diamonds) are TikTok-backend numbers — they read &ldquo;—&rdquo; until
          you enter them on a session&apos;s page (Save numbers) or via the screenshot import.
        </p>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-white dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2.5 font-medium text-xs uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
