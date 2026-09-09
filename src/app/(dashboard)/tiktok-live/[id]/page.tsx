import { notFound } from "next/navigation";
import { sessionDetail, streamerAccountIds } from "@/lib/tiktok-live/queries";
import { getSessionUser } from "@/lib/auth/authorize";
import { SessionEditor } from "./manual-metrics-form";
import { ProductBadges } from "@/components/product-badges";
import { MobileTable } from "@/components/mobile/mobile-table";
import { RecordCard, RecordList } from "@/components/mobile/record-card";
import { mytDate } from "@/lib/tiktok-live/live-analysis-core";
import { METRIC_LABEL, missingMetrics } from "@/lib/tiktok-live/completeness";

/**
 * MYT, and only MYT — a live's clock time is the streamer's own local time, and
 * the same formatter the Home feed titles its cards with, so the live you tapped
 * is recognisably the live you landed on.
 */
const whenFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function TikTokSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Screenshot reading needs the AI key; without it the card says so rather than
  // failing on upload (same rule as the streamer's import page).
  const aiConfigured = !!process.env.AI_GATEWAY_API_KEY;
  // Scope streamers to their own handles — a session that isn't theirs 404s.
  const me = await getSessionUser();
  const isStreamer = me?.role === "live_streamer";
  const scope =
    isStreamer && me?.userId ? await streamerAccountIds(me.userId) : undefined;
  let data: Awaited<ReturnType<typeof sessionDetail>> | null = null;
  let error: string | null = null;
  try {
    data = await sessionDetail(id, scope);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  if (data && !data.session && !error) notFound();
  const s = data?.session ?? null;
  const leads = data?.leads ?? [];

  // The same four nullable columns the reminder jobs and the Home feed read,
  // through the same pure function — so the 10pm nudge and this strip can never
  // disagree about whether this live still owes numbers. Costs no query.
  const missing = s ? missingMetrics(s).map((m) => METRIC_LABEL[m]) : [];

  return (
    <div className="px-4 py-5 sm:p-8">
      {/* The inline "← TikTok Live" link is gone: `BackBar` renders one back
          control on every non-home route already, and two of them 40px apart
          is a choice nobody needs to make. */}

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {s && (
        <>
          <header className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
              {s.title || "Live session"}
            </h1>

            {/* Two renderings of one line. The phone gets when-and-how-long on
                top and the handle under it, because on a 375px screen today's
                single line wraps between "@adminain111 ·" and the date and reads
                as two unrelated facts. `lg` keeps the exact line it has always
                had, in the same place (P5). */}
            <div className="mt-1 lg:hidden">
              <p className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                {s.startedAt ? whenFmt.format(s.startedAt) : "Time not recorded"}
                {s.durationSeconds ? ` · ${fmtDuration(s.durationSeconds)}` : ""}
              </p>
              <p className="mt-0.5 font-mono text-sm text-zinc-500 dark:text-zinc-400">
                @{s.handle}
              </p>
            </div>
            <p className="mt-1 hidden text-sm text-zinc-500 lg:block">
              <span className="font-mono">@{s.handle}</span> ·{" "}
              {s.startedAt
                ? new Date(s.startedAt).toLocaleString("en-MY", { hour12: false })
                : "—"}{" "}
              · {fmtDuration(s.durationSeconds)}
            </p>

            {s.products && s.products.length > 0 && (
              <div className="mt-2">
                <ProductBadges products={s.products} />
              </div>
            )}

            {/* Names the gaps rather than counting them: "Missing: Total Leads,
                DMs" is a task, "2 missing" is a riddle. */}
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-sm leading-relaxed ${
                missing.length > 0
                  ? "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
                  : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              }`}
            >
              {missing.length > 0 ? `Missing: ${missing.join(", ")}` : "All numbers in ✓"}
            </p>
          </header>

          {/* One editable surface for this live: the metrics list, the camera
              that feeds it, and the product tags. It owns the page's single
              docked Save. */}
          <SessionEditor
            sessionId={s.id}
            isStreamer={isStreamer}
            aiConfigured={aiConfigured}
            sessionDate={
              s.startedAt ? mytDate(new Date(s.startedAt).toISOString()) : null
            }
            products={s.products ?? []}
            remarks={s.remarks}
            initial={{
              totalViews: s.totalViews,
              peakViewers: s.peakViewers,
              avgViewers: s.avgViewers,
              newFollowers: s.newFollowers,
              totalLikes: s.totalLikes,
              totalComments: s.totalComments,
              totalShares: s.totalShares,
              durationMinutes: Math.round(s.durationSeconds / 60),
              uniqueViewers: s.uniqueViewers,
              activeViewers: s.activeViewers,
              avgWatchSeconds: s.avgWatchSeconds,
              directMessages: s.directMessages,
              serviceBioViews: s.serviceBioViews,
              interestedViewers: s.interestedViewers,
              diamonds: s.diamonds,
              totalLeads: s.totalLeads,
              filteredLeads: s.filteredLeads,
              keywordLeads: s.keywordLeads,
            }}
          />

          {/* The keyword-comment worklist is an ADMIN follow-up tool — hidden
              from streamers, who use this page only to verify their live numbers. */}
          {!isStreamer && (
            <section className="mt-8">
              <h2 className="mb-3 text-[17px] font-semibold text-zinc-900 lg:text-sm lg:font-semibold lg:uppercase lg:tracking-wider lg:text-zinc-500 dark:text-zinc-100 dark:lg:text-zinc-500">
                Lead worklist — viewers who commented a keyword ({leads.length})
              </h2>
              {/* `allowEscape` is off on an empty list: the grid it reveals is
                  one "no keyword leads" row, which the cards already say. */}
              <MobileTable
                escapeLabel="Show the full worklist grid"
                allowEscape={leads.length > 0}
                table={
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
                        <tr>
                          <Th>Viewer</Th>
                          <Th>Keyword</Th>
                          <Th>Comment</Th>
                          <Th>When</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-10 text-center text-zinc-500">
                              No keyword leads captured for this live.
                            </td>
                          </tr>
                        )}
                        {leads.map((l, i) => (
                          <tr key={i} className="border-t border-zinc-100 dark:border-zinc-900">
                            <Td>
                              <a
                                href={`https://www.tiktok.com/@${l.username}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                @{l.username}
                              </a>
                              {l.displayName && (
                                <span className="ml-2 text-xs text-zinc-500">{l.displayName}</span>
                              )}
                            </Td>
                            <Td>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                                {l.keyword}
                              </span>
                            </Td>
                            <Td className="max-w-[320px] truncate text-zinc-600 dark:text-zinc-300">
                              {l.commentText ?? "—"}
                            </Td>
                            <Td className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                              {l.commentedAt
                                ? new Date(l.commentedAt).toLocaleString("en-MY", { hour12: false })
                                : "—"}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                }
                cards={
                  leads.length === 0 ? (
                    <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                      No keyword leads captured for this live.
                    </p>
                  ) : (
                    <RecordList>
                      {/* The old page ended with "Tip: click a viewer to open
                          their TikTok profile, then PM them your WhatsApp
                          link." — a sentence explaining a link that was styled
                          as 12px body text. Each card's footer link is a 44px
                          row that says what it does, so the tip has nothing
                          left to explain. */}
                      {leads.map((l, i) => (
                        <RecordCard
                          key={i}
                          title={<span className="font-mono">@{l.username}</span>}
                          status={{ label: l.keyword, tone: "emerald" }}
                          meta={
                            <>
                              {l.displayName && <span className="block">{l.displayName}</span>}
                              {l.commentText && <span className="block">{l.commentText}</span>}
                              {l.commentedAt && (
                                <span className="block text-xs tabular-nums">
                                  {new Date(l.commentedAt).toLocaleString("en-MY", {
                                    hour12: false,
                                  })}
                                </span>
                              )}
                            </>
                          }
                          footer={
                            <a
                              href={`https://www.tiktok.com/@${l.username}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-11 items-center text-sm font-medium text-blue-600 active:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-blue-400 dark:active:bg-blue-950/40"
                            >
                              Open TikTok profile to PM them →
                            </a>
                          }
                        />
                      ))}
                    </RecordList>
                  )
                }
              />
            </section>
          )}
        </>
      )}
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
