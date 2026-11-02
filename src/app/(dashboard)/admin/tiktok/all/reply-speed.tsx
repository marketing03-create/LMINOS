import Link from "next/link";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import type { ReplySpeed, ReplySummary } from "@/lib/wati/reply-speed";

/**
 * The Dashboard's "CS replies" pane: how fast Customer Service answered
 * WhatsApp leads in the chosen period. Median first (what a typical customer
 * waited), average beside it, then by day and — when there is more than one —
 * by WATI account. Server component; numbers from lib/wati/reply-speed.ts.
 *
 * Every number opens the WhatsApp log filtered to exactly the customers behind
 * it (`logHref`), so any figure here can be checked row by row.
 */

type LogHref = (extra: Record<string, string>) => string;

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

export function ReplySpeedPane({
  data,
  periodLabel,
  logHref,
}: {
  data: ReplySpeed | null;
  periodLabel: string;
  logHref?: LogHref;
}) {
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

      <Tiles s={data} logHref={logHref} />

      {data.byDay.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">By day</h3>
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
            {data.byDay.map((d) => (
              <li key={d.day}>
                <MaybeLink
                  href={logHref?.({ day: d.day, status: "tracked" })}
                  className="block px-4 py-3 active:bg-zinc-50 lg:hover:bg-zinc-50 dark:active:bg-zinc-800/60 lg:dark:hover:bg-zinc-900"
                >
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
                </MaybeLink>
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
                <Tiles s={c} compact logHref={logHref ? (x) => logHref({ ...x, conn: c.id }) : undefined} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Tiles({ s, compact, logHref }: { s: ReplySummary; compact?: boolean; logHref?: LogHref }) {
  // The speed tiles are worked out over every tracked customer; Replied and No
  // reply yet open just their own share.
  const items: { label: string; value: string; accent?: boolean; warn?: boolean; status: string }[] = [
    { label: "Median reply", value: fmtMin(s.medianMin), accent: true, status: "tracked" },
    { label: "Average reply", value: fmtMin(s.averageMin), status: "tracked" },
    { label: "Within 5 min", value: pct(s.within5Pct), status: "replied" },
    { label: "Within 15 min", value: pct(s.within15Pct), status: "replied" },
    { label: "Replied", value: `${s.replied}/${s.leads}`, status: "replied" },
    { label: "No reply yet", value: String(s.noReply), warn: s.noReply > 0, status: "waiting" },
  ];
  return (
    <dl className={`grid grid-cols-2 gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3 lg:grid-cols-6"}`}>
      {items.map((i) => (
        <MaybeLink
          key={i.label}
          href={logHref?.({ status: i.status })}
          className="block rounded-xl border border-zinc-200 bg-white px-3 py-2.5 active:bg-zinc-50 lg:hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800 lg:dark:bg-zinc-950 lg:dark:hover:border-zinc-700"
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
        </MaybeLink>
      ))}
    </dl>
  );
}

/** A link when there is somewhere to go, a plain block otherwise. */
function MaybeLink({
  href,
  className,
  children,
}: {
  href?: string;
  className: string;
  children: React.ReactNode;
}) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}
