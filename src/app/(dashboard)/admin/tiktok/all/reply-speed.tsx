import { HelpChip } from "@/components/mobile/metric-help-sheet";
import type { ReplySpeed, ReplySummary } from "@/lib/wati/reply-speed";

/**
 * The Dashboard's "CS replies" pane: how fast Customer Service answered
 * WhatsApp leads in the chosen period. Median first (what a typical customer
 * waited), average beside it, then by day and — when there is more than one —
 * by WATI account. Server component; numbers from lib/wati/reply-speed.ts.
 */

const dayFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "UTC", // `day` is already a Malaysia calendar date
  weekday: "short",
  day: "numeric",
  month: "short",
});

function fmtMin(m: number | null): string {
  if (m === null) return "—";
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}

const pct = (p: number | null) => (p === null ? "—" : `${p}%`);

export function ReplySpeedPane({ data, periodLabel }: { data: ReplySpeed | null; periodLabel: string }) {
  if (!data || data.leads === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
        No CS reply times in {periodLabel.toLowerCase()}.
      </div>
    );
  }

  // Bars are scaled to the slowest day's median, so the slow day reads long.
  const maxDay = Math.max(1, ...data.byDay.map((d) => d.medianMin ?? 0));

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">CS reply speed</h2>
        <HelpChip keys={["replyMedian", "replyAverage", "replyWithin", "noReply"]} />
      </div>

      <Tiles s={data} />

      {data.byDay.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">By day</h3>
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
            {data.byDay.map((d) => (
              <li key={d.day} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{dayFmt.format(new Date(`${d.day}T00:00:00Z`))}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{fmtMin(d.medianMin)}</span>
                    <span className="text-zinc-500">
                      {" "}
                      · {d.replied}/{d.leads} replied
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.max(2, ((d.medianMin ?? 0) / maxDay) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.byConnection.length > 1 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            By WhatsApp account
          </h3>
          <ul className="space-y-3">
            {data.byConnection.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950"
              >
                <div className="mb-3 font-medium">{c.name}</div>
                <Tiles s={c} compact />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Tiles({ s, compact }: { s: ReplySummary; compact?: boolean }) {
  const items: { label: string; value: string; accent?: boolean; warn?: boolean }[] = [
    { label: "Median reply", value: fmtMin(s.medianMin), accent: true },
    { label: "Average reply", value: fmtMin(s.averageMin) },
    { label: "Within 5 min", value: pct(s.within5Pct) },
    { label: "Within 15 min", value: pct(s.within15Pct) },
    { label: "Replied", value: `${s.replied}/${s.leads}` },
    { label: "No reply yet", value: String(s.noReply), warn: s.noReply > 0 },
  ];
  return (
    <dl className={`grid grid-cols-2 gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3 lg:grid-cols-6"}`}>
      {items.map((i) => (
        <div
          key={i.label}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950"
        >
          <dt className="text-sm text-zinc-500 dark:text-zinc-400">{i.label}</dt>
          <dd
            className={`mt-0.5 text-xl font-semibold tabular-nums ${
              i.accent
                ? "text-indigo-600 dark:text-indigo-400"
                : i.warn
                  ? "text-amber-600 dark:text-amber-400"
                  : ""
            }`}
          >
            {i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
