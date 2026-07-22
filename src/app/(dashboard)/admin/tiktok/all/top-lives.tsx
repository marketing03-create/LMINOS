import Link from "next/link";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import type { AnalysisSession } from "@/lib/tiktok-live/live-analysis-core";
import { topLives, type RankedLive } from "@/lib/tiktok-live/overview-core";

const fmtDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * The two handfuls of lives worth actually rewatching.
 *
 * Ranked on views per live hour because that is ~100% recorded and therefore
 * works for every handle — ranking on leads would silently rank on whose
 * customer-service team fills forms in, and ranking on keyword comments would
 * rank on whose keywords happen to be configured.
 */
export function TopLives({ sessions }: { sessions: AnalysisSession[] }) {
  const { best, weakest } = topLives(sessions);
  if (best.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="mb-1 flex items-center gap-1.5">
        <h2 id="lives" className="scroll-mt-28 text-lg font-semibold">
          Best &amp; weakest lives
        </h2>
        <HelpTip text={METRIC_HELP.topLives} label="About this list" />
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        By views per hour streamed. Lives under 30 minutes are excluded, so a
        6-minute burst can&apos;t top the list.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Strongest response" rows={best} tone="emerald" />
        {weakest.length > 0 ? (
          <Panel title="Lowest response — worth rewatching" rows={weakest} tone="zinc" />
        ) : (
          <div className="grid place-items-center rounded-xl border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
            Not enough lives in this period to separate a weakest group without
            repeating the ones above.
          </div>
        )}
      </div>
    </section>
  );
}

function Panel({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: RankedLive[];
  tone: "emerald" | "zinc";
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div
        className={`border-b px-3 py-2 text-xs font-semibold ${
          tone === "emerald"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300"
        }`}
      >
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800">
              <th className="px-3 py-1.5 font-semibold">When</th>
              <th className="px-3 py-1.5 font-semibold">Handle</th>
              <th className="px-3 py-1.5 text-right font-semibold">Mins</th>
              <th className="px-3 py-1.5 text-right font-semibold">Views</th>
              <th className="px-3 py-1.5 text-right font-semibold">Views / hr</th>
              <th className="px-3 py-1.5 text-right font-semibold">Leads</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr
                key={l.id}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                <td className="whitespace-nowrap px-3 py-1.5">
                  <Link
                    href={`/tiktok-live/${l.id}`}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {l.startedAt ? fmtDate.format(new Date(l.startedAt)) : "—"}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-zinc-500">
                  @{l.handle}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {l.durationMinutes}
                </td>
                {/* The raw view count sits beside the rate on purpose, so a
                    31-minute live can't top the list on a rate alone. */}
                <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">
                  {l.totalViews?.toLocaleString("en-MY") ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                  {l.viewsPerHour.toLocaleString("en-MY")}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums ${
                    l.totalLeads == null ? "text-zinc-400 dark:text-zinc-600" : ""
                  }`}
                  title={l.totalLeads == null ? "Not entered — not zero" : undefined}
                >
                  {l.totalLeads?.toLocaleString("en-MY") ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
