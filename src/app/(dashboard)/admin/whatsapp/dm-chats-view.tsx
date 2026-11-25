import Link from "next/link";
import type { DmChatRow } from "@/lib/wati/tiktok";
import { TikTokMark } from "@/components/channel-mark";
import { ChatLink, Eyebrow, MessageBlock, clockFmt, dayLabel } from "./row-parts";

/**
 * The Chats page's TikTok DM view: every TikTok user who DM'd a linked handle
 * on each day (WATI's TikTok channel → lib/wati/tiktok.ts). Same shape as the
 * WhatsApp chats: tiles that filter, a heading per day, a card per chat on a
 * phone and a table on a laptop. A DM has no phone number — the person is
 * their TikTok name.
 */

type Only = "new" | "returning" | "waiting" | undefined;

function groupByDay(rows: DmChatRow[]) {
  const groups = new Map<string, DmChatRow[]>();
  for (const r of rows) groups.set(r.day, [...(groups.get(r.day) ?? []), r]);
  return [...groups].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, rows]) => ({ day, rows }));
}

const waiting = (r: DmChatRow) => r.latestMessageFrom === "customer";

export function DmChatsView({
  rows,
  all,
  only,
  href,
  connected,
}: {
  /** Rows after the tile filter. */
  rows: DmChatRow[];
  /** Every row in the period, for the tile counts. */
  all: DmChatRow[];
  only: Only;
  href: (only: string | undefined) => string;
  /** At least one TikTok account is connected in WATI. */
  connected: boolean;
}) {
  const tiles = [
    { key: undefined, label: "All DMs", n: all.length },
    { key: "new", label: "New", n: all.filter((r) => r.isNew).length },
    { key: "returning", label: "Returning", n: all.filter((r) => !r.isNew).length },
    { key: "waiting", label: "No reply yet", n: all.filter(waiting).length, warn: true },
  ] as const;

  return (
    <>
      <nav aria-label="TikTok DMs" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => {
          const on = t.key === only;
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
                  "warn" in t && t.warn && t.n > 0 ? "text-amber-600 dark:text-amber-400" : ""
                }`}
              >
                {t.n.toLocaleString("en-MY")}
              </span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {connected ? (
            "No TikTok DMs in this period."
          ) : (
            <>
              No TikTok account connected yet.{" "}
              <Link href="/admin/integrations#tiktok-dms" className="font-medium text-blue-600 underline dark:text-blue-400">
                Integrations
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Phone: one card per chat, under a heading per day. */}
          <div className="xl:hidden">
            {groupByDay(rows).map((g) => (
              <section key={g.day} className="mb-6">
                <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
                  {dayLabel(g.day)}
                  <span className="font-normal text-zinc-500">
                    {g.rows.length} DM{g.rows.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
                  {g.rows.map((r) => (
                    <li
                      key={`${r.contactId}-${r.day}`}
                      className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-900 ${
                        waiting(r) ? "border-amber-300 dark:border-amber-800" : "border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <TikTokMark className="h-8 w-8" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[15px] font-semibold">{r.name || "TikTok user"}</span>
                              <NewBadge isNew={r.isNew} />
                            </div>
                            <div className="flex items-center gap-2 text-sm text-zinc-500">
                              <span className="truncate">{r.handle ? `to @${r.handle}` : r.connectionName}</span>
                              <ChatLink url={r.chatUrl} />
                            </div>
                          </div>
                        </div>
                        <Replied r={r} />
                      </div>
                      {r.latestMessageText && r.latestMessageAt && (
                        <div className="mt-3">
                          <MessageBlock
                            label="Newest"
                            from={r.latestMessageFrom === "cs" ? "cs" : "customer"}
                            at={r.latestMessageAt}
                            text={r.latestMessageText}
                          />
                        </div>
                      )}
                      <div className="mt-3 text-sm tabular-nums text-zinc-500">{clockFmt.format(r.lastAt)}</div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Laptop: one table, a divider row per day. */}
          <div className="hidden overflow-x-clip rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 xl:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 shadow-[0_1px_0_0_rgb(228_228_231)] dark:bg-zinc-900 dark:shadow-[0_1px_0_0_rgb(39_39_42)]">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">TikTok user</th>
                  <th className="px-3 py-2.5 font-medium">Newest message</th>
                  <th className="px-3 py-2.5 font-medium">Handle</th>
                  <th className="px-3 py-2.5 font-medium">CS reply</th>
                </tr>
              </thead>
              {groupByDay(rows).map((g) => (
                <tbody key={g.day}>
                  <tr className="border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <th colSpan={5} scope="rowgroup" className="px-3 py-2 text-left text-sm font-semibold">
                      {dayLabel(g.day)}
                      <span className="ml-2 font-normal text-zinc-500">
                        {g.rows.length} DM{g.rows.length === 1 ? "" : "s"} · {g.rows.filter((r) => r.isNew).length} new
                      </span>
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr
                      key={`${r.contactId}-${r.day}`}
                      className={`border-t border-zinc-100 align-top dark:border-zinc-900 ${waiting(r) ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}
                    >
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-zinc-600 dark:text-zinc-300">{clockFmt.format(r.lastAt)}</td>
                      <td className="w-60 px-3 py-3">
                        <div className="flex items-center gap-2">
                          <TikTokMark className="h-6 w-6" />
                          <span className="line-clamp-1 font-medium">{r.name || "TikTok user"}</span>
                          <NewBadge isNew={r.isNew} />
                        </div>
                        <div className="mt-0.5 pl-8">
                          <ChatLink url={r.chatUrl} />
                        </div>
                      </td>
                      <td className="min-w-[12rem] px-3 py-3 text-zinc-700 dark:text-zinc-300">
                        {r.latestMessageText && r.latestMessageAt ? (
                          <>
                            <Eyebrow from={r.latestMessageFrom === "cs" ? "cs" : "customer"} at={r.latestMessageAt} />
                            <span className="line-clamp-2">{r.latestMessageText}</span>
                          </>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="w-44 px-3 py-3 text-zinc-600 dark:text-zinc-300">{r.handle ? `@${r.handle}` : "—"}</td>
                      <td className="w-28 whitespace-nowrap px-3 py-3">
                        <Replied r={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
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

function Replied({ r }: { r: DmChatRow }) {
  return waiting(r) ? (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
      No reply yet
    </span>
  ) : (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
      Replied
    </span>
  );
}
