import Link from "next/link";
import { rangeFromParams } from "@/lib/date-range";
import { requireAdminPage } from "@/lib/auth/page-guard";
import { whatsappChats, whatsappLog, type ChatsResult, type LogResult, type LogStatus } from "@/lib/wati/log";
import { ChatsView } from "./chats-view";
import { LogFilters } from "./log-filters";
import { RevealPhone } from "./reveal-phone";
import {
  ChatLink,
  Counted,
  Eyebrow,
  MessageBlock,
  Reply,
  byDay,
  clockFmt,
  dayFmt,
  dayLabel,
  timeFmt,
} from "./row-parts";

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
  /** "chats" (default): every customer who wrote each day, like WATI's inbox. "first": first contact. */
  view?: string;
  /** Chats view filter: new | returning | waiting. */
  only?: string;
};

const STATUSES: { key: "all" | "replied" | "waiting" | "untracked"; label: string }[] = [
  { key: "all", label: "All customers" },
  { key: "replied", label: "Replied" },
  { key: "waiting", label: "No reply yet" },
  { key: "untracked", label: "Not tracked" },
];

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
  // A live or a reply-status link (from the Dashboard) is about first contacts.
  const view: "chats" | "first" = sp.view === "first" || live || sp.status ? "first" : "chats";
  const only = sp.only === "new" || sp.only === "returning" || sp.only === "waiting" ? sp.only : undefined;

  let data: LogResult | null = null;
  let chats: ChatsResult | null = null;
  let error: string | null = null;
  try {
    if (view === "chats") {
      chats = await whatsappChats({ range: choice.range, accountId: streamer, connIds, day, q, only });
    } else data = await whatsappLog({
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
  if (view === "first" && !live && status === "all") keep.view = "first";
  if (only) keep.only = only;

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

      {!live && (
        <nav aria-label="View" className="mb-4 inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {(
            [
              ["chats", "Chats"],
              ["first", "First contact"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={href({ view: key === "chats" ? undefined : "first", status: undefined, only: undefined })}
              aria-current={view === key ? "page" : undefined}
              scroll={false}
              className={`inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium ${
                view === key
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}

      <LogFilters
        choice={choice}
        connections={data?.connections ?? chats?.connections ?? []}
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

      {chats && <ChatsView data={chats} only={only} href={(o) => href({ only: o })} />}

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
              <div className="xl:hidden">
                {byDay(data.rows).map((g) => (
                  <section key={g.day} className="mb-6">
                  <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                    {dayLabel(g.day)}
                    <span className="font-normal text-zinc-500">
                      {g.rows.length} customer{g.rows.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  {/* Phone: one card per customer. */}
                    <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
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
                          <div className="mt-3 space-y-2">
                            <MessageBlock label="First" from={r.opening.from} text={r.opening.text} />
                            {r.latest && (
                              <MessageBlock
                                label="Newest"
                                from={r.latest.from}
                                at={r.latest.at}
                                text={r.latest.text}
                              />
                            )}
                          </div>
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

              {/* Desktop: one table, a divider row per day so the columns line up.
                  Table from xl (where it fits without scrolling sideways), and
                  overflow-x-clip, not auto: a scroll box would stop the header
                  sticking to the top of the window. */}
              <div className="hidden overflow-x-clip rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 xl:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 shadow-[0_1px_0_0_rgb(228_228_231)] dark:bg-zinc-900 dark:shadow-[0_1px_0_0_rgb(39_39_42)]">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Time</th>
                      <th className="px-3 py-2.5 font-medium">Customer</th>
                      <th className="px-3 py-2.5 font-medium">First message</th>
                      <th className="px-3 py-2.5 font-medium">Newest message</th>
                      <th className="px-3 py-2.5 font-medium">From live</th>
                      <th className="px-3 py-2.5 font-medium">CS reply</th>
                    </tr>
                  </thead>
                  {byDay(data.rows).map((g) => (
                    <tbody key={g.day}>
                      <tr className="border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/60">
                        <th colSpan={6} scope="rowgroup" className="px-3 py-2 text-left text-sm font-semibold">
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
                            <td className="w-60 px-3 py-3">
                              <div className="line-clamp-1 font-medium">{r.name || "No name"}</div>
                              <div className="flex items-center gap-2 whitespace-nowrap text-zinc-500">
                                <RevealPhone id={r.id} last4={r.phoneLast4} />
                                <ChatLink url={r.chatUrl} />
                              </div>
                              {!connIds.length && (
                                <div className="mt-0.5 truncate text-xs text-zinc-500">{r.connectionName}</div>
                              )}
                            </td>
                            <td className="min-w-[9rem] px-3 py-3 text-zinc-700 dark:text-zinc-300">
                              <Eyebrow from={r.opening.from} />
                              <span className="line-clamp-2">{r.opening.text ?? "—"}</span>
                            </td>
                            <td className="min-w-[9rem] px-3 py-3 text-zinc-700 dark:text-zinc-300">
                              {r.latest ? (
                                <>
                                  <Eyebrow from={r.latest.from} at={r.latest.at} />
                                  <span className="line-clamp-2">{r.latest.text ?? "—"}</span>
                                </>
                              ) : (
                                <span className="text-zinc-400">—</span>
                              )}
                            </td>
                            <td className="w-52 px-3 py-3">
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
