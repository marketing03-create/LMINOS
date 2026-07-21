import Link from "next/link";
import type { SessionRow } from "@/lib/tiktok-live/queries";
import { ProductBadges } from "@/components/product-badges";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";

/**
 * Instagram-style streamer Home: an insights strip (Lives · Total leads · Avg)
 * then a feed of live-session cards. A live with no leads yet shows an amber
 * "Add results" nudge; every card taps through to its session page where the
 * streamer keys the numbers in. Mobile-first, but reads fine on desktop too.
 */

const whenFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const fmtWhen = (d: Date | null) => (d ? whenFmt.format(d) : "—");
const nf = (n: number) => n.toLocaleString("en-MY");
function fmtDur(sec: number): string | null {
  if (!sec) return null;
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export function StreamerHomeFeed({ sessions }: { sessions: SessionRow[] }) {
  const lives = sessions.length;
  const withLeads = sessions.filter((s) => s.totalLeads != null);
  const totalLeads = withLeads.reduce((a, s) => a + (s.totalLeads ?? 0), 0);
  const avg = withLeads.length ? Math.round(totalLeads / withLeads.length) : null;
  const missing = lives - withLeads.length;

  if (lives === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
        <div className="text-sm font-medium">No lives in this period yet</div>
        <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500">
          Your lives show up here automatically. Tap the blue{" "}
          <span className="font-semibold text-blue-600 dark:text-blue-400">+</span> below
          to add results from a screenshot.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Insights strip */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Lives" value={nf(lives)} help={METRIC_HELP.sessions} />
        <Stat
          label="Total leads"
          value={nf(totalLeads)}
          help={METRIC_HELP.totalLeads}
          accent
        />
        <Stat
          label="Avg / live"
          value={avg == null ? "—" : nf(avg)}
          help="Your Total leads divided by the number of lives that have leads recorded."
        />
      </div>

      {missing > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {missing} live{missing === 1 ? "" : "s"} still need leads — tap a card marked{" "}
          <b>Add results</b>.
        </div>
      )}

      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Your lives
      </div>

      <div className="space-y-3">
        {sessions.map((s) => {
          const needs = s.totalLeads == null;
          const dur = fmtDur(s.durationSeconds);
          return (
            <Link
              key={s.id}
              href={`/tiktok-live/${s.id}`}
              className={`block rounded-2xl border bg-white p-4 active:bg-zinc-50 dark:bg-zinc-950 dark:active:bg-zinc-900 ${
                needs
                  ? "border-amber-300 dark:border-amber-800"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{fmtWhen(s.startedAt)}</span>
                  {s.products && s.products.length > 0 && (
                    <ProductBadges products={s.products} />
                  )}
                </div>
                {needs && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    Add results
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-5 gap-1 text-center">
                <Metric label="Views" value={nf(s.totalViews)} help={METRIC_HELP.views} />
                <Metric label="Duration" value={dur ?? "—"} help={METRIC_HELP.duration} />
                <Metric
                  label="DMs"
                  value={s.directMessages == null ? "—" : nf(s.directMessages)}
                  help={METRIC_HELP.dms}
                />
                <Metric
                  label="Total leads"
                  value={s.totalLeads == null ? "—" : nf(s.totalLeads)}
                  help={METRIC_HELP.totalLeads}
                  accent={s.totalLeads != null}
                />
                <Metric
                  label="Filtered leads"
                  value={s.filteredLeads == null ? "—" : nf(s.filteredLeads)}
                  help={METRIC_HELP.filteredLeads}
                  accent={s.filteredLeads != null}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  help,
}: {
  label: string;
  value: string;
  accent?: boolean;
  help?: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-zinc-900">
      <div className="flex items-center gap-1 text-[11px] text-zinc-500">
        {label}
        {help && <HelpTip text={help} label={`What is ${label}?`} />}
      </div>
      <div
        className={`text-xl font-semibold tabular-nums ${
          accent ? "text-blue-600 dark:text-blue-400" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  help,
}: {
  label: string;
  value: string;
  accent?: boolean;
  help?: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className={`truncate text-sm font-semibold tabular-nums ${
          accent ? "text-blue-600 dark:text-blue-400" : ""
        }`}
      >
        {value}
      </div>
      {/* wraps rather than overflowing — five of these sit side by side on a phone */}
      <div className="flex flex-wrap items-center justify-center gap-x-1 text-[10px] leading-tight text-zinc-500">
        {label}
        {help && <HelpTip text={help} label={`What is ${label}?`} />}
      </div>
    </div>
  );
}
