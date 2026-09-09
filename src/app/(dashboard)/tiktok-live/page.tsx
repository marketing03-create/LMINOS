import Link from "next/link";
import { rangeFromParams } from "@/lib/date-range";
import {
  streamerAccountIds,
  tiktokAccountsForPicker,
  tiktokLiveSessionList,
  type SessionRow,
} from "@/lib/tiktok-live/queries";
import { getSessionUser } from "@/lib/auth/authorize";
import { fmtInt } from "@/lib/date-range";
import { CompactDateFilter } from "@/components/compact-date-filter";
import { ProductBadges } from "@/components/product-badges";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import { MobileTable } from "@/components/mobile/mobile-table";
import { RecordCard, RecordList } from "@/components/mobile/record-card";
import { missingMetrics } from "@/lib/tiktok-live/completeness";
import { SessionHighlighter } from "./session-highlighter";
import { HandleFilter } from "./handle-filter";
import { StreamerHomeFeed } from "./streamer-home-feed";
import { FeedRefresh } from "./feed-refresh";
import { RemarksInput } from "./remarks-input";

/** Per-column explanations, shown in a “?” beside each header. */
const HELP: Record<string, string> = {
  Duration: METRIC_HELP.duration,
  Views: METRIC_HELP.views,
  Peak: METRIC_HELP.peak,
  Avg: METRIC_HELP.avg,
  Followers: METRIC_HELP.followers,
  Likes: METRIC_HELP.likes,
  Comments: METRIC_HELP.comments,
  Shares: METRIC_HELP.shares,
  Unique: METRIC_HELP.unique,
  Active: METRIC_HELP.active,
  Watch: METRIC_HELP.watch,
  DMs: METRIC_HELP.dms,
  BioViews: METRIC_HELP.bioViews,
  Interested: METRIC_HELP.interested,
  Diamonds: METRIC_HELP.diamonds,
  PMLeads: METRIC_HELP.commentLeads,
  TotalLeads: METRIC_HELP.totalLeads,
  FilteredLeads: METRIC_HELP.filteredLeads,
};

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Nullable metric → "—" until it's entered (manual TikTok-backend numbers). */
function fmtN(v: number | null): string {
  return v == null ? "—" : fmtInt(v);
}

/**
 * The admin card's timestamp. The table prints the full machine-ish
 * `toLocaleString(en-MY, hour12:false)` because a 22-column grid is read by
 * scanning a column, and a fixed-width string scans best. A card is read one at
 * a time, so it gets the same MYT clock in the shape a person says out loud.
 */
const cardWhenFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export default async function TikTokLivePage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    start?: string;
    end?: string;
    handle?: string;
  }>;
}) {
  const sp = await searchParams;
  const choice = rangeFromParams(sp);

  // A live streamer only sees the handle(s) assigned to them; admins see all and
  // can narrow to one streamer with the ?handle picker.
  const me = await getSessionUser();
  const isStreamer = me?.role === "live_streamer";
  const selectedHandle = typeof sp.handle === "string" ? sp.handle : "all";
  const importHref = isStreamer
    ? "/tiktok-live/import"
    : "/admin/tiktok/screenshots";

  let scope: string[] | undefined;
  let handles: { id: string; handle: string }[] = [];
  if (isStreamer && me?.userId) {
    scope = await streamerAccountIds(me.userId);
  } else {
    try {
      handles = await tiktokAccountsForPicker();
    } catch {
      // picker just won't show if the handle list can't load
    }
    scope = selectedHandle !== "all" ? [selectedHandle] : undefined;
  }

  // Date params to carry across the streamer picker (and vice-versa).
  const preserve: Record<string, string> = {};
  if (sp.range) preserve.range = sp.range;
  if (sp.start) preserve.start = sp.start;
  if (sp.end) preserve.end = sp.end;

  let sessions: SessionRow[] = [];
  let error: string | null = null;
  try {
    sessions = await tiktokLiveSessionList(choice.range, 200, scope);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="px-4 py-5 sm:p-8">
      <SessionHighlighter />
      {/* Keeps the feed in sync with what's saved, even from a cached page or
          iOS bfcache — fixes "I keyed in results but see no record". */}
      <FeedRefresh />
      {isStreamer ? (
        /* The streamer's date control now lives in the feed's own header, beside
           the count it filters — one control, one place, and the empty state
           gets to hold it too. The only reason it still appears here is the
           database-down branch below, where the feed never renders and losing
           the range control would leave her with an error and no way out. */
        error && (
          <header className="mb-5 flex flex-wrap items-center justify-end gap-3">
            <CompactDateFilter basePath="/tiktok-live" choice={choice} />
          </header>
        )
      ) : (
        /* Shared markup, resized with responsive prefixes only: below `lg` the
           controls stack full-width at 44px+ instead of wrapping into a row of
           38px boxes; from `lg` up every box is the size it is today. */
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">TikTok Live</h1>
            <p className="mt-1 text-sm text-zinc-500">
              LIVE session performance — viewers, likes, comments, shares per stream.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
            {handles.length > 0 && (
              <HandleFilter handles={handles} value={selectedHandle} preserve={preserve} />
            )}
            <Link
              href={importHref}
              className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium active:bg-zinc-100 lg:min-h-0 dark:border-zinc-700 lg:hover:bg-zinc-100 dark:active:bg-zinc-900 dark:lg:hover:bg-zinc-900"
            >
              Import LIVE screenshots →
            </Link>
            <Link
              href="/tiktok-live/import"
              className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium active:bg-zinc-100 lg:min-h-0 dark:border-zinc-700 lg:hover:bg-zinc-100 dark:active:bg-zinc-900 dark:lg:hover:bg-zinc-900"
            >
              Manual Input
            </Link>
            <CompactDateFilter
              basePath="/tiktok-live"
              choice={choice}
              extraParams={
                selectedHandle !== "all" ? { handle: selectedHandle } : undefined
              }
            />
          </div>
        </header>
      )}

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      {/* Streamers get the to-do list; admins keep the wide table at lg+. */}
      {isStreamer && !error && (
        <StreamerHomeFeed sessions={sessions} choice={choice} />
      )}

      {!isStreamer && sessions.length === 0 && !error && (
        <div className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
          No live sessions in this period.{" "}
          Register handles on{" "}
          <Link href="/admin/tiktok" className="underline">
            TikTok Live admin
          </Link>{" "}
          and connect a vendor to start pulling data.
        </div>
      )}

      {!isStreamer && sessions.length > 0 && (
        /* Same rows, two renderings, one data source. The table is handed
           through untouched and still owns `lg+`; below it, 22 columns become
           cards, because the alternative on a 375px screen is a two-axis
           scroll box nested inside the page scroll. A manager on a landscape
           phone can still ask for the real grid. */
        <MobileTable
          table={
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
                  <tr>
                    <Th className="sticky left-0 z-30">When</Th>
                    <Th>Handle</Th>
                    <Th>Title</Th>
                    <Th>Product</Th>
                    <Th className="text-right" help={HELP.Duration}>Duration</Th>
                    <Th className="text-right" help={HELP.Views}>Views</Th>
                    <Th className="text-right" help={HELP.Peak}>Peak</Th>
                    <Th className="text-right" help={HELP.Avg}>Avg</Th>
                    <Th className="text-right" help={HELP.Followers}>Followers</Th>
                    <Th className="text-right" help={HELP.Likes}>Likes</Th>
                    <Th className="text-right" help={HELP.Comments}>Comments</Th>
                    <Th className="text-right" help={HELP.Shares}>Shares</Th>
                    <Th className="text-right" help={HELP.Unique}>Unique</Th>
                    <Th className="text-right" help={HELP.Active}>Active</Th>
                    <Th className="text-right" help={HELP.Watch}>Watch</Th>
                    <Th className="text-right" help={HELP.DMs}>DMs</Th>
                    <Th className="text-right" help={HELP.BioViews}>Bio views</Th>
                    <Th className="text-right" help={HELP.Interested}>Interested</Th>
                    <Th className="text-right" help={HELP.Diamonds}>Diamonds</Th>
                    <Th className="text-right" help={HELP.TotalLeads}>Total leads</Th>
                    <Th className="text-right" help={HELP.FilteredLeads}>Filtered leads</Th>
                    <Th>Remarks</Th>
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
                        <Link
                          href={`/tiktok-live/${s.id}`}
                          className="underline underline-offset-2 decoration-zinc-300 dark:decoration-zinc-600 hover:text-blue-600 dark:hover:text-blue-400 hover:decoration-blue-400"
                        >
                          {s.startedAt
                            ? new Date(s.startedAt).toLocaleString("en-MY", { hour12: false })
                            : "—"}
                        </Link>
                      </Td>
                      <Td className="font-mono text-xs">@{s.handle}</Td>
                      <Td className="max-w-[110px] sm:max-w-[220px] truncate">{s.title ?? "—"}</Td>
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
                      <Td className="text-right tabular-nums text-indigo-600 dark:text-indigo-400 font-semibold">{fmtN(s.totalLeads)}</Td>
                      <Td className="text-right tabular-nums text-zinc-500">{fmtN(s.filteredLeads)}</Td>
                      <Td className="align-top">
                        <RemarksInput compact sessionId={s.id} initial={s.remarks} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
          cards={<SessionCards sessions={sessions} />}
        />
      )}

    </div>
  );
}

/**
 * The admin session list below `lg`. Every column of the table survives — the
 * three an admin actually scans sit on the face of the card, the other fourteen
 * are one tap down — and the amber rail is `missingMetrics()`, the same
 * definition the streamer's Home and the reminder jobs use, so a manager
 * chasing a live and the streamer being chased are looking at the same verdict.
 *
 * No `id="session-<id>"` here, deliberately: the table rows already carry those
 * ids and both renderings are in the DOM at once. Duplicating them would give
 * `SessionHighlighter` two elements to choose from and it would pick the hidden
 * one.
 */
function SessionCards({ sessions }: { sessions: SessionRow[] }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <HelpChip
          keys={["views", "totalLeads", "filteredLeads", "dms", "bioViews", "duration"]}
        />
      </div>
      <RecordList legend="Not entered means nobody has keyed that number in yet — it is not a zero.">
        {sessions.map((s) => (
          <RecordCard
            key={s.id}
            href={`/tiktok-live/${s.id}`}
            tone={missingMetrics(s).length > 0 ? "warn" : "good"}
            title={s.startedAt ? cardWhenFmt.format(s.startedAt) : "Time not recorded"}
            meta={
              <>
                <span className="font-mono">@{s.handle}</span>
                {s.title ? ` · ${s.title}` : null}
              </>
            }
            badges={<ProductBadges products={s.products} />}
            primary={[
              { label: "Views", value: s.totalViews },
              { label: "Total leads", value: s.totalLeads, tone: "accent" },
              { label: "Filtered leads", value: s.filteredLeads },
            ]}
            detail={[
              { label: "Duration", value: fmtDuration(s.durationSeconds) },
              { label: "Peak", value: s.peakViewers },
              { label: "Avg", value: s.avgViewers },
              { label: "Followers", value: s.newFollowers },
              { label: "Likes", value: s.totalLikes },
              { label: "Comments", value: s.totalComments },
              { label: "Shares", value: s.totalShares },
              { label: "Unique", value: s.uniqueViewers },
              { label: "Active", value: s.activeViewers },
              {
                label: "Watch",
                value: s.avgWatchSeconds == null ? null : `${s.avgWatchSeconds}s`,
              },
              { label: "DMs", value: s.directMessages },
              { label: "Bio views", value: s.serviceBioViews },
              { label: "Interested", value: s.interestedViewers },
              { label: "Diamonds", value: s.diamonds },
            ]}
            /* Remarks stays editable on a phone. It is the one column of this
               table that is an input rather than a reading, and dropping it
               below `lg` would mean an admin can read a live anywhere but can
               only annotate one at a desk. */
            footer={
              <div className="w-full">
                <RemarksInput sessionId={s.id} initial={s.remarks} />
              </div>
            }
          />
        ))}
      </RecordList>
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
  help?: string;
}) {
  return (
    <th
      className={`sticky top-0 z-20 bg-zinc-50 dark:bg-zinc-900 px-2 sm:px-4 py-1.5 sm:py-2.5 font-medium text-xs uppercase tracking-wider whitespace-nowrap ${className}`}
    >
      {help ? (
        <span className="inline-flex items-center gap-1 align-middle">
          <span>{children}</span>
          <HelpTip text={help} label={typeof children === "string" ? children : undefined} />
        </span>
      ) : (
        children
      )}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 sm:px-4 py-1.5 sm:py-2.5 ${className}`}>{children}</td>;
}
