import Link from "next/link";
import { fmtInt } from "@/lib/date-range";
import type { SessionRow } from "@/lib/tiktok-live/queries";
import { ProductBadges } from "@/components/product-badges";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import { MobileTable } from "@/components/mobile/mobile-table";
import { RecordCard, RecordList } from "@/components/mobile/record-card";
import { NotEntered } from "@/components/mobile/not-entered";
import { missingMetrics } from "@/lib/tiktok-live/completeness";

/**
 * The dash a DESKTOP cell prints for a number nobody has entered.
 *
 * `text-current` rather than a colour of our own, and that is the whole point:
 * today's cells disagree about their ink — Total leads is indigo-600 semibold,
 * most of the manual columns are zinc-500, Duration is plain body ink — and the
 * dash is a bare string that inherits whichever it lands in. Letting
 * `NotEntered` paint it zinc-400 would repaint about a dozen cells on the
 * managers' daily screen and call that "parity". Inheriting keeps the pixels
 * identical while the glyph finally announces itself as "Not entered" to a
 * screen reader instead of as an em dash.
 *
 * One element reused across every cell: React renders the same element
 * description many times happily, and it keeps the dash rule in exactly one
 * place.
 */
const dash = <NotEntered variant="dash" className="text-current" />;

/** `null` (not "—") when there is no duration, so the CARD path can say so in words. */
function fmtDuration(sec: number): string | null {
  if (!sec) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtN(v: number | null): React.ReactNode {
  return v == null ? dash : fmtInt(v);
}

/**
 * The card timestamp, pinned to `Asia/Kuala_Lumpur`.
 *
 * The desktop table below calls `toLocaleString` with no timeZone, so on Vercel
 * it prints UTC — an admin and the streamer looking at the same live currently
 * read times eight hours apart. We cannot fix that in the table without moving
 * every desktop row (P5), so the card, which is new, is simply born correct.
 */
const cardWhen = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * The TikTok Live sessions table with the frozen header row + "When" column.
 * `linkHandle` turns the handle into a link to that streamer's detail page
 * (used on the main admin list; off on the streamer's own detail page).
 *
 * Twenty-two columns is roughly 2,000px, and it lives in an `overflow-auto
 * max-h-[70vh]` box nested inside the page scroll — so on a 375px phone this is
 * a two-axis scroll trap in which only "When" is on screen and Total leads, the
 * number an admin actually opened the page for, is column 21 about 1,800px to
 * the right. `MobileTable` keeps that grid untouched at `lg+` and hands a thumb
 * a card list instead, with the same rows, from the same server render.
 *
 * Composed here rather than at the two call sites on purpose: `/admin/tiktok/all`
 * and `/admin/tiktok/[id]` both render `<SessionsTable/>` and neither has to
 * change or learn about a second component. Passing both renderings as props to
 * a client wrapper also keeps this file a server component, so 500 session rows
 * are not serialised across the boundary a second time.
 */
export function SessionsTable({
  sessions,
  linkHandle = true,
}: {
  sessions: SessionRow[];
  linkHandle?: boolean;
}) {
  return (
    <MobileTable
      table={<SessionsGrid sessions={sessions} linkHandle={linkHandle} />}
      cards={<SessionCardList sessions={sessions} linkHandle={linkHandle} />}
    />
  );
}

/**
 * The same rows as cards. Exported as a sibling with the same props so a route
 * that already owns its own `MobileTable` (a pane, a `Disclosure`) can render
 * the card half on its own without reaching into this file.
 *
 * Three numbers on the face — Views, Total leads, Filtered leads, today's
 * columns 6, 21 and 22 — because those are what an admin scans; the other
 * fifteen sit one tap down in table-column order, so muscle memory transfers.
 *
 * No `id="session-<id>"` on the cards, and that is deliberate rather than an
 * oversight of §7.1: both renderings are in the DOM at once, and
 * `SessionHighlighter` resolves `#session-<id>` with `getElementById`, which
 * returns the FIRST match in document order — the table row, which is the
 * hidden one below `lg`. Duplicating the id would not restore the post-save
 * flash on a phone, it would only guarantee the highlighter scrolls to a
 * `display:none` element. The rows keep the ids they have today.
 */
export function SessionCardList({
  sessions,
  linkHandle = true,
}: {
  sessions: SessionRow[];
  linkHandle?: boolean;
}) {
  return (
    <RecordList legend="Not entered means nobody has keyed that number in yet — it is not a zero.">
      {sessions.map((s) => {
        const missing = missingMetrics(s);
        return (
          <RecordCard
            key={s.id}
            href={`/tiktok-live/${s.id}`}
            tone={missing.length > 0 ? "warn" : "good"}
            title={s.startedAt ? cardWhen.format(s.startedAt) : "Time not recorded"}
            /* The title wraps here instead of `max-w-[220px] truncate`-ing:
               a live's title is often the only thing that tells two same-day
               lives apart, and clipping it is how a card list stops being
               readable while still looking tidy. */
            meta={
              <>
                <span className="font-mono">@{s.handle}</span>
                {s.title ? ` · ${s.title}` : null}
              </>
            }
            badges={<ProductBadges products={s.products} />}
            status={
              missing.length > 0
                ? {
                    label: `Needs ${missing.length} number${missing.length === 1 ? "" : "s"}`,
                    tone: "amber",
                  }
                : { label: "Complete", tone: "emerald" }
            }
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
              { label: "Comment leads", value: s.keywordLeads },
            ]}
            detailLabel="All 22 numbers"
            /* Only the second destination needs a footer link. "Open live" is
               the card itself — a whole-card tap is the target P2 asks for, and
               repeating it as a 44px link below the numbers would put two
               controls on one card that do exactly the same thing. */
            footer={
              linkHandle ? (
                <Link
                  href={`/admin/tiktok/${s.accountId}`}
                  className="inline-flex min-h-11 items-center font-mono font-medium text-blue-600 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:text-blue-400"
                >
                  @{s.handle} &rarr;
                </Link>
              ) : null
            }
          />
        );
      })}
    </RecordList>
  );
}

/**
 * Today's grid, byte for byte. It renders inside `MobileTable`'s `hidden
 * lg:block` slot, so every `whitespace-nowrap`, every sticky offset, the 21
 * header `HelpTip`s and the row `hover:` are exactly what a manager has on
 * screen right now — and the `hover:`-only affordances are no longer a problem
 * below `lg`, because below `lg` this subtree does not exist.
 */
function SessionsGrid({
  sessions,
  linkHandle,
}: {
  sessions: SessionRow[];
  linkHandle: boolean;
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
                    : dash}
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
              <Td className="max-w-[220px] truncate">{s.title ?? dash}</Td>
              <Td className="whitespace-nowrap">
                <ProductBadges products={s.products} />
              </Td>
              <Td className="text-right tabular-nums">
                {fmtDuration(s.durationSeconds) ?? dash}
              </Td>
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
                {s.avgWatchSeconds == null ? dash : `${s.avgWatchSeconds}s`}
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
