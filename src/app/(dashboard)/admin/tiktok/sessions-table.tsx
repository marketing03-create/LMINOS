import Link from "next/link";
import { fmtInt } from "@/lib/roas/metrics";
import type { SessionRow } from "@/lib/tiktok-live/queries";
import { ProductBadges } from "@/components/product-badges";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtN(v: number | null): string {
  return v == null ? "—" : fmtInt(v);
}

/**
 * The TikTok Live sessions table with the frozen header row + "When" column.
 * `linkHandle` turns the handle into a link to that streamer's detail page
 * (used on the main admin list; off on the streamer's own detail page).
 */
export function SessionsTable({
  sessions,
  linkHandle = true,
}: {
  sessions: SessionRow[];
  linkHandle?: boolean;
}) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-auto max-h-[70vh]">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
          <tr>
            <Th className="sticky left-0 z-30">When</Th>
            <Th>Handle</Th>
            <Th>Title</Th>
            <Th help="The loan product(s) this live promoted.">Product</Th>
            <Th className="text-right" help={METRIC_HELP.duration}>Duration</Th>
            <Th className="text-right" help={METRIC_HELP.views}>Views</Th>
            <Th className="text-right" help={METRIC_HELP.peak}>Peak</Th>
            <Th className="text-right" help={METRIC_HELP.avg}>Avg</Th>
            <Th className="text-right" help={METRIC_HELP.followers}>Followers</Th>
            <Th className="text-right" help={METRIC_HELP.likes}>Likes</Th>
            <Th className="text-right" help={METRIC_HELP.comments}>Comments</Th>
            <Th className="text-right" help={METRIC_HELP.shares}>Shares</Th>
            <Th className="text-right" help={METRIC_HELP.unique}>Unique</Th>
            <Th className="text-right" help={METRIC_HELP.active}>Active</Th>
            <Th className="text-right" help={METRIC_HELP.watch}>Watch</Th>
            <Th className="text-right" help={METRIC_HELP.dms}>DMs</Th>
            <Th className="text-right" help={METRIC_HELP.bioViews}>Bio views</Th>
            <Th className="text-right" help={METRIC_HELP.interested}>Interested</Th>
            <Th className="text-right" help={METRIC_HELP.diamonds}>Diamonds</Th>
            {/* Renders keywordLeads — was mislabelled "Comments", which clashed
                with the chat-comments column above. */}
            <Th className="text-right" help={METRIC_HELP.commentLeads}>Comment leads</Th>
            <Th className="text-right" help={METRIC_HELP.totalLeads}>Total leads</Th>
            <Th className="text-right" help={METRIC_HELP.filteredLeads}>Filtered leads</Th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.id}
              id={`session-${s.id}`}
              className="group scroll-mt-24 border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            >
              <Td className="sticky left-0 z-10 bg-white dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900/50 text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                <Link href={`/tiktok-live/${s.id}`} className="hover:underline">
                  {s.startedAt
                    ? new Date(s.startedAt).toLocaleString("en-MY", { hour12: false })
                    : "—"}
                </Link>
              </Td>
              <Td className="font-mono text-xs whitespace-nowrap">
                {linkHandle ? (
                  <Link
                    href={`/admin/tiktok/${s.accountId}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    @{s.handle}
                  </Link>
                ) : (
                  <span>@{s.handle}</span>
                )}
              </Td>
              <Td className="max-w-[220px] truncate">{s.title ?? "—"}</Td>
              <Td className="whitespace-nowrap">
                <ProductBadges products={s.products} />
              </Td>
              <Td className="text-right tabular-nums">{fmtDuration(s.durationSeconds)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(s.totalViews)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtInt(s.peakViewers)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtInt(s.avgViewers)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtInt(s.newFollowers ?? 0)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(s.totalLikes)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(s.totalComments)}</Td>
              <Td className="text-right tabular-nums">{fmtInt(s.totalShares)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.uniqueViewers)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.activeViewers)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">
                {s.avgWatchSeconds == null ? "—" : `${s.avgWatchSeconds}s`}
              </Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.directMessages)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.serviceBioViews)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.interestedViewers)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.diamonds)}</Td>
              <Td className="text-right tabular-nums font-medium">
                <Link href={`/tiktok-live/${s.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {fmtInt(s.keywordLeads)}
                </Link>
              </Td>
              <Td className="text-right tabular-nums text-indigo-600 dark:text-indigo-400 font-semibold">{fmtN(s.totalLeads)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.filteredLeads)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className = "",
  help,
}: {
  children: React.ReactNode;
  className?: string;
  /** Short plain-English explanation, shown behind a "?" beside the label. */
  help?: string;
}) {
  return (
    <th
      className={`sticky top-0 z-20 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 font-medium text-xs uppercase tracking-wider ${className}`}
    >
      {help ? (
        <span
          className={`inline-flex items-center gap-1 ${
            className.includes("text-right") ? "justify-end" : ""
          }`}
        >
          {children}
          <HelpTip text={help} label={`What is ${String(children)}?`} />
        </span>
      ) : (
        children
      )}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
