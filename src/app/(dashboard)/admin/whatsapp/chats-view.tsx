import Link from "next/link";
import type { ChatRow, ChatsResult } from "@/lib/wati/log";
import { ChatLink, Counted, Eyebrow, MessageBlock, PhoneNumber, clockFmt, dayLabel, fmtPhone } from "./row-parts";

/**
 * The WhatsApp log's Chats view: every customer who wrote on each day, per
 * number — the same count as WATI's Team Inbox for that day and number
 * (lib/wati/log.ts → whatsappChats). New = their first-ever contact was that
 * day; Returning = they had written before.
 */


function groupByDay(rows: ChatRow[]): { day: string; rows: ChatRow[] }[] {
  const groups = new Map<string, ChatRow[]>();
  for (const r of rows) groups.set(r.chat.day, [...(groups.get(r.chat.day) ?? []), r]);
  return [...groups].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, rows]) => ({ day, rows }));
}

const TILES = [
  { key: undefined, label: "All chats", value: (s: ChatsResult["summary"]) => s.chats },
  { key: "new", label: "New", value: (s: ChatsResult["summary"]) => s.newChats },
  { key: "returning", label: "Returning", value: (s: ChatsResult["summary"]) => s.returning },
  { key: "waiting", label: "No reply yet", value: (s: ChatsResult["summary"]) => s.waiting, warn: true },
] as const;

export function ChatsView({
  data,
  only,
  href,
}: {
  data: ChatsResult;
  only: "new" | "returning" | "waiting" | undefined;
  href: (only: string | undefined) => string;
}) {
  return (
    <>
      <nav aria-label="Chats" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILES.map((t) => {
          const on = t.key === only;
          const n = t.value(data.summary);
          return (
            <Link
              key={t.label}
              href={href(t.key)}
              aria-current={on ? "page" : undefined}
              scroll={false}
              className={`rounded-xl border px-3 py-2.5 transition-colors ${
                on
                  ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600 dark:bg-blue-950/40"
                  : "border-zinc-200 bg-white active:bg-zinc-50 lg:hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950 lg:dark:hover:border-zinc-700"
              }`}
            >
              <span className={`block text-sm ${on ? "font-medium text-blue-700 dark:text-blue-300" : "text-zinc-500 dark:text-zinc-400"}`}>
                {t.label}
              </span>
              <span
                className={`mt-0.5 block text-xl font-semibold tabular-nums ${
                  "warn" in t && t.warn && n > 0 ? "text-amber-600 dark:text-amber-400" : ""
                }`}
              >
                {n.toLocaleString("en-MY")}
              </span>
            </Link>
          );
        })}
      </nav>

      {data.perNumber.length > 0 && (
        <ul aria-label="Chats per number" className="mb-5 flex flex-wrap gap-2">
          {data.perNumber.map((p) => (
            <li
              key={p.number ?? "unknown"}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950"
            >
              <span className="font-medium tabular-nums">{p.number ? fmtPhone(p.number) : "Number unknown"}</span>
              <span className="ml-2 tabular-nums text-zinc-500">
                {p.chats} chat{p.chats === 1 ? "" : "s"} · {p.newChats} new
              </span>
            </li>
          ))}
        </ul>
      )}

      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No chats in this period.
        </div>
      ) : (
        <>
          {/* Phone: one card per chat, under a heading per day. */}
          <div className="xl:hidden">
            {groupByDay(data.rows).map((g) => (
              <section key={g.day} className="mb-6">
                <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                  {dayLabel(g.day)}
                  <span className="font-normal text-zinc-500">
                    {g.rows.length} chat{g.rows.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
                  {g.rows.map((r) => (
                    <li
                      key={`${r.id}-${r.chat.day}-${r.chat.number}`}
                      className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-900 ${
                        r.chat.answered ? "border-zinc-200 dark:border-zinc-800" : "border-amber-300 dark:border-amber-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold">{r.name || "No name"}</span>
                            <NewBadge isNew={r.chat.isNew} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                            <PhoneNumber phone={r.phone} />
                            <ChatLink url={r.chatUrl} />
                          </div>
                        </div>
                        <Answered r={r} />
                      </div>
                      <div className="mt-3 space-y-2">
                        {r.latest && <MessageBlock label="Newest" from={r.latest.from} at={r.latest.at} text={r.latest.text} />}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
                        <span className="tabular-nums">{clockFmt.format(r.chat.at)}</span>
                        {r.chat.number && <span>· to {fmtPhone(r.chat.number)}</span>}
                        <span className="text-zinc-300 dark:text-zinc-700">·</span>
                        <Counted r={r} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Desktop: one table, a divider row per day. */}
          <div className="hidden overflow-x-clip rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 xl:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 shadow-[0_1px_0_0_rgb(228_228_231)] dark:bg-zinc-900 dark:shadow-[0_1px_0_0_rgb(39_39_42)]">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Newest message</th>
                  <th className="px-3 py-2.5 font-medium">From live</th>
                  <th className="px-3 py-2.5 font-medium">CS reply</th>
                </tr>
              </thead>
              {groupByDay(data.rows).map((g) => (
                <tbody key={g.day}>
                  <tr className="border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <th colSpan={5} scope="rowgroup" className="px-3 py-2 text-left text-sm font-semibold">
                      {dayLabel(g.day)}
                      <span className="ml-2 font-normal text-zinc-500">
                        {g.rows.length} chat{g.rows.length === 1 ? "" : "s"} · {g.rows.filter((r) => r.chat.isNew).length} new
                      </span>
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr
                      key={`${r.id}-${r.chat.day}-${r.chat.number}`}
                      className={`border-t border-zinc-100 align-top dark:border-zinc-900 ${
                        r.chat.answered ? "" : "bg-amber-50/60 dark:bg-amber-950/20"
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-zinc-600 dark:text-zinc-300">
                        {clockFmt.format(r.chat.at)}
                      </td>
                      <td className="w-60 px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="line-clamp-1 font-medium">{r.name || "No name"}</span>
                          <NewBadge isNew={r.chat.isNew} />
                        </div>
                        <div className="flex items-center gap-2 whitespace-nowrap text-zinc-500">
                          <PhoneNumber phone={r.phone} />
                          <ChatLink url={r.chatUrl} />
                        </div>
                        {r.chat.number && (
                          <div className="mt-0.5 text-xs tabular-nums text-zinc-500">to {fmtPhone(r.chat.number)}</div>
                        )}
                      </td>
                      <td className="min-w-[12rem] px-3 py-3 text-zinc-700 dark:text-zinc-300">
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
                        <Answered r={r} />
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
  );
}

function NewBadge({ isNew }: { isNew: boolean }) {
  return isNew ? (
    <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
      New
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      Returning
    </span>
  );
}

/** CS answered after their last message that day — the same as WATI's "Unreplied". */
function Answered({ r }: { r: ChatRow }) {
  return r.chat.answered ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
      Replied
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
      No reply yet
    </span>
  );
}
