import Link from "next/link";
import { notFound } from "next/navigation";
import { sessionDetail, streamerAccountIds } from "@/lib/tiktok-live/queries";
import { getSessionUser } from "@/lib/auth/authorize";
import { SessionMetricsCard } from "./manual-metrics-form";
import { SessionScreenshotCard } from "./session-screenshot-card";
import { ProductSelect } from "./product-select";
import { ProductBadges } from "@/components/product-badges";
import { mytDate } from "@/lib/tiktok-live/live-analysis-core";

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

  return (
    <div className="p-4 sm:p-8">
      <Link href="/tiktok-live" className="text-sm text-zinc-500 hover:underline">
        ← TikTok Live
      </Link>

      {error && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {s && (
        <>
          <header className="mt-2 mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              {s.title || "Live session"}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
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
          </header>

          {/* Product / service first — what this live promoted. */}
          <div className="mb-6">
            <ProductSelect sessionId={s.id} initial={s.products ?? []} />
          </div>

          {/* Screenshots first — the fast path. The live is already known here,
              so the photos apply straight to it with no matching step. */}
          <div className="mb-6">
            <SessionScreenshotCard
              sessionId={s.id}
              aiConfigured={aiConfigured}
              sessionDate={s.startedAt ? mytDate(new Date(s.startedAt).toISOString()) : null}
              current={{
                totalViews: s.totalViews,
                peakViewers: s.peakViewers,
                avgViewers: s.avgViewers,
                newFollowers: s.newFollowers,
                totalLikes: s.totalLikes,
                totalComments: s.totalComments,
                totalShares: s.totalShares,
                uniqueViewers: s.uniqueViewers,
                activeViewers: s.activeViewers,
                avgWatchSeconds: s.avgWatchSeconds,
                directMessages: s.directMessages,
                serviceBioViews: s.serviceBioViews,
                interestedViewers: s.interestedViewers,
                diamonds: s.diamonds,
              }}
            />
          </div>

          {/* Every metric is editable — check each against your screenshots. */}
          <div className="mb-8">
            <SessionMetricsCard
              sessionId={s.id}
              isStreamer={isStreamer}
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
          </div>

          {/* The keyword-comment worklist is an ADMIN follow-up tool — hidden
              from streamers, who use this page only to verify their live numbers. */}
          {!isStreamer && (
            <>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Lead worklist — viewers who commented a keyword ({leads.length})
              </h2>
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
              <p className="mt-3 text-xs text-zinc-500">
                Tip: click a viewer to open their TikTok profile, then PM them your WhatsApp link.
              </p>
            </>
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
