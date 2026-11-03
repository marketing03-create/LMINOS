import Link from "next/link";
import { rangeFromParams } from "@/lib/date-range";
import { requireAdminPage } from "@/lib/auth/page-guard";
import { whatsappLog, type LogResult, type LogRow, type LogStatus } from "@/lib/wati/log";
import { LogFilters } from "./log-filters";
import { RevealPhone } from "./reveal-phone";

/**
 * WhatsApp log — every customer who WhatsApp'd a connected WATI account, one
 * row each: when, which account, their first message, the live they were
 * counted for (or why not) and the CS reply. Admin only. Every WhatsApp number
 * on the Dashboard and TikTok Live links here with its own filters, so the
 * rows ARE that number (lib/wati/log.ts uses the same rules).
 */

type SP = {
  range?: string;
  start?: string;
  end?: string;
  streamer?: string;
  conn?: string;
  day?: string;
  live?: string;
  status?: string;
  q?: string;
};

const STATUSES: { key: "all" | "replied" | "waiting" | "untracked"; label: string }[] = [
  { key: "all", label: "All customers" },
  { key: "replied", label: "Replied" },
  { key: "waiting", label: "No reply yet" },
  { key: "untracked", label: "Not tracked" },
];

const timeFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dayFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "UTC", // a `day` param is already a Malaysia date
  weekday: "short",
  day: "numeric",
  month: "short",
});

const clockFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST
const mytDay = (d: Date) => new Date(d.getTime() + MYT_MS).toISOString().slice(0, 10);

/** Rows split by Malaysia day, newest first (rows already arrive newest first). */
function byDay(rows: LogRow[]): { day: string; rows: LogRow[] }[] {
  const groups: { day: string; rows: LogRow[] }[] = [];
  for (const r of rows) {
    const day = mytDay(r.firstMessageAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.rows.push(r);
    else groups.push({ day, rows: [r] });
  }
  return groups;
}

function dayLabel(day: string, now = new Date()): string {
  if (day === mytDay(now)) return "Today";
  if (day === mytDay(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return dayFmt.format(new Date(`${day}T00:00:00Z`));
}

function fmtMin(m: number): string {
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}

const UUID = /^[0-9a-f-]{36}$/i;

export default async function WhatsAppLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;

  // A preset picked in the form wins over the custom dates it carries along.
  const choice = sp.range
    ? rangeFromParams({ range: sp.range })
    : rangeFromParams({ start: sp.start, end: sp.end });
  const status: LogStatus = (["all", "tracked", "replied", "waiting", "untracked"] as const).includes(
    sp.status as LogStatus
  )
    ? (sp.status as LogStatus)
    : "all";
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : undefined;
  const live = sp.live && UUID.test(sp.live) ? sp.live : undefined;
  const streamer = sp.streamer && UUID.test(sp.streamer) ? sp.streamer : undefined;
  const connIds = (sp.conn ?? "").split(",").filter((c) => UUID.test(c));
  const q = (sp.q ?? "").replace(/\D/g, "").slice(0, 15);

  let data: LogResult | null = null;
  let error: string | null = null;
  try {
    data = await whatsappLog({
      range: choice.range,
      accountId: streamer,
      connIds,
      day,
      liveId: live,
      status,
      q,
    });
  } catch (err) {
    console.error("[whatsapp-log] failed:", err);
    error = "The WhatsApp log couldn't load. Try again in a moment.";
  }

  // Links keep every current filter and change one.
  const href = (patch: Partial<Record<keyof SP, string | undefined>>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/whatsapp${s ? `?${s}` : ""}`;
  };

  const chips: { label: string; clear: Partial<Record<keyof SP, undefined>> }[] = [];
  if (data?.live)
    chips.push({
      label: `Live: @${data.live.handle} · ${timeFmt.format(data.live.startedAt)}`,
      clear: { live: undefined },
    });
  if (day) chips.push({ label: dayFmt.format(new Date(`${day}T00:00:00Z`)), clear: { day: undefined } });
  if (streamer) chips.push({ label: "One streamer's WATI account", clear: { streamer: undefined } });
  if (status === "tracked") chips.push({ label: "Reply tracked", clear: { status: undefined } });

  const keep: Record<string, string> = {};
  if (live) keep.live = live;
  if (day) keep.day = day;
  if (streamer) keep.streamer = streamer;
  if (status !== "all") keep.status = status;

  return (
    <div className="px-4 py-5 sm:p-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">WhatsApp log</h1>
        {data?.live && (
          <p className="mt-1 text-sm text-zinc-500">
            Customers counted for @{data.live.handle} · {timeFmt.format(data.live.startedAt)}
          </p>
        )}
      </header>

      <LogFilters
        choice={choice}
        connections={data?.connections ?? []}
        conn={connIds.length === 1 ? connIds[0] : ""}
        q={q}
        keep={keep}
      />

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={href(c.clear)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-zinc-100 px-3 text-sm font-medium text-zinc-700 active:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {c.label}
              <span aria-hidden="true" className="text-zinc-400">
                ✕
              </span>
              <span className="sr-only">(remove filter)</span>
            </Link>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* The status boxes ARE the filter: tap one to show only those rows. */}
          <nav aria-label="Reply status" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {STATUSES.map((st) => {
              const on = st.key === status || (st.key === "all" && status === "tracked");
              const n = data.statusCounts[st.key];
              const warn = st.key === "waiting" && n > 0;
              return (
                <Link
                  key={st.key}
                  href={href({ status: st.key === "all" ? undefined : st.key })}
                  aria-current={on ? "page" : undefined}
                  scroll={false}
                  className={`rounded-xl border px-3 py-2.5 transition-colors ${
                    on
                      ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600 dark:bg-blue-950/40"
                      : "border-zinc-200 bg-white active:bg-zinc-50 lg:hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950 lg:dark:hover:border-zinc-700"
                  }`}
                >
                  <span
                    className={`block text-sm ${
                      on ? "font-medium text-blue-700 dark:text-blue-300" : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {st.label}
                  </span>
                  <span
                    className={`mt-0.5 block text-xl font-semibold tabular-nums ${
                      warn ? "text-amber-600 dark:text-amber-400" : ""
                    }`}
                  >
                    {n.toLocaleString("en-MY")}
                  </span>
                </Link>
              );
            })}
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
              <span className="block text-sm text-zinc-500 dark:text-zinc-400">From a live</span>
              <span className="mt-0.5 block text-xl font-semibold tabular-nums">
                {data.summary.counted.toLocaleString("en-MY")}
                {data.summary.customers > 0 && (
                  <span className="ml-1.5 text-sm font-normal text-zinc-500">
                    {Math.round((data.summary.counted / data.summary.customers) * 100)}%
                  </span>
                )}
              </span>
            </div>
          </nav>

          {data.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No customers in this period.
            </div>
          ) : (
            <>
              {/* Phone: one card per customer, under a heading per day. */}
              <div className="lg:hidden">
                {byDay(data.rows).map((g) => (
                  <section key={g.day} className="mb-6">
                  <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                    {dayLabel(g.day)}
                    <span className="font-normal text-zinc-500">
                      {g.rows.length} customer{g.rows.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  {/* Phone: one card per customer. */}
                    <ul className="space-y-3 lg:hidden">
                      {g.rows.map((r) => (
                        <li
                          key={r.id}
                          className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-900 ${
                            r.reply.kind === "waiting"
                              ? "border-amber-300 dark:border-amber-800"
                              : "border-zinc-200 dark:border-zinc-800"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-[15px] font-semibold">{r.name || "No name"}</div>
                              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                                <RevealPhone id={r.id} last4={r.phoneLast4} />
                                <ChatLink url={r.chatUrl} />
                              </div>
                            </div>
                            <Reply r={r} />
                          </div>
                          {r.firstMessageText && (
                            <p className="mt-3 line-clamp-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                              {r.firstMessageText}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <span className="tabular-nums text-zinc-500">{clockFmt.format(r.firstMessageAt)}</span>
                            {!connIds.length && <span className="text-zinc-500">· {r.connectionName}</span>}
                            <span className="text-zinc-300 dark:text-zinc-700">·</span>
                            <Counted r={r} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              {/* Desktop: one table, a divider row per day so the columns line up. */}
              <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:block">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-900">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Time</th>
                      <th className="px-3 py-2.5 font-medium">Customer</th>
                      <th className="px-3 py-2.5 font-medium">First message</th>
                      <th className="px-3 py-2.5 font-medium">From live</th>
                      <th className="px-3 py-2.5 font-medium">CS reply</th>
                    </tr>
                  </thead>
                  {byDay(data.rows).map((g) => (
                    <tbody key={g.day}>
                      <tr className="border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/60">
                        <th colSpan={5} scope="rowgroup" className="px-3 py-2 text-left text-sm font-semibold">
                          {dayLabel(g.day)}
                          <span className="ml-2 font-normal text-zinc-500">
                            {g.rows.length} customer{g.rows.length === 1 ? "" : "s"}
                          </span>
                        </th>
                      </tr>
                        {g.rows.map((r) => (
                          <tr
                            key={r.id}
                            className={`border-t border-zinc-100 align-top dark:border-zinc-900 ${
                              r.reply.kind === "waiting" ? "bg-amber-50/60 dark:bg-amber-950/20" : ""
                            }`}
                          >
                            <td className="whitespace-nowrap px-3 py-3 tabular-nums text-zinc-600 dark:text-zinc-300">
                              {clockFmt.format(r.firstMessageAt)}
                            </td>
                            <td className="w-52 px-3 py-3">
                              <div className="line-clamp-1 font-medium">{r.name || "No name"}</div>
                              <div className="flex flex-wrap items-center gap-2 text-zinc-500">
                                <RevealPhone id={r.id} last4={r.phoneLast4} />
                                <ChatLink url={r.chatUrl} />
                              </div>
                              {!connIds.length && (
                                <div className="mt-0.5 truncate text-xs text-zinc-500">{r.connectionName}</div>
                              )}
                            </td>
                            <td className="min-w-[14rem] px-3 py-3 text-zinc-700 dark:text-zinc-300">
                              <span className="line-clamp-2">{r.firstMessageText ?? "—"}</span>
                            </td>
                            <td className="w-64 px-3 py-3">
                              <Counted r={r} />
                            </td>
                            <td className="w-28 whitespace-nowrap px-3 py-3">
                              <Reply r={r} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  ))}
                </table>
              </div>

              {data.truncated && (
                <p className="mt-3 text-sm text-zinc-500">
                  Showing the newest {data.rows.length} of {data.total}. Narrow the period to see the rest.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Opens this customer's chat in WATI Team Inbox, in a new tab. */
function ChatLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-300 px-2 text-xs font-medium text-emerald-700 active:bg-emerald-50 lg:hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:active:bg-emerald-950/40 lg:dark:hover:bg-emerald-950/40"
    >
      Chat
      <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens WATI in a new tab)</span>
    </a>
  );
}

function Reply({ r }: { r: LogRow }) {
  if (r.reply.kind === "replied") {
    return (
      <span className="inline-flex flex-col items-end text-right lg:items-start lg:text-left">
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          {fmtMin(r.reply.minutes)}
        </span>
        {r.reply.by && <span className="mt-0.5 text-xs text-zinc-500">by {r.reply.by}</span>}
      </span>
    );
  }
  if (r.reply.kind === "waiting") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
        No reply yet
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      Not tracked
    </span>
  );
}

function Counted({ r }: { r: LogRow }) {
  // Their real first message (WATI history) is earlier than the one TT Stars
  // first saw. Only an earlier DAY is a return; the same day just means they
  // wrote before TT Stars heard them (e.g. before the account was connected).
  const sameDay =
    r.firstContactAt && dateFmt.format(r.firstContactAt) === dateFmt.format(r.firstMessageAt);
  const returning = r.firstContactAt ? (
    <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {sameDay
        ? `First wrote ${timeFmt.format(r.firstContactAt)}`
        : `Returning · since ${dateFmt.format(r.firstContactAt)}`}
    </span>
  ) : null;
  if (r.counted.kind === "live") {
    return (
      <span>
        <Link
          href={`/tiktok-live/${r.counted.liveId}`}
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          @{r.counted.handle} · {timeFmt.format(r.counted.startedAt)}
        </Link>
        {returning}
      </span>
    );
  }
  // A returning customer's badge already says so — don't say it twice.
  if (r.counted.reason === "returning" && returning) {
    return <span className="text-zinc-500">{returning}</span>;
  }
  const why =
    r.counted.reason === "no-handle"
      ? "No TikTok handle linked"
      : r.counted.reason === "returning"
        ? "Returning customer"
        : "Outside live hours";
  return (
    <span className="text-zinc-500">
      {why}
      {returning}
    </span>
  );
}
