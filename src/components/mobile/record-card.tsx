import Link from "next/link";
import { MetricGrid, type MetricItem } from "@/components/mobile/metric-line";
import { Disclosure } from "@/components/mobile/disclosure";

/**
 * A row of a table, re-shot as a card — the shape every list in the app takes
 * below `lg`. It exists because a 22-column session row, a 12-column streamer
 * row and a 6-column user row all fail the same way on a 375px screen: they
 * either scroll sideways or shrink their numbers to 10px. One card primitive
 * means we solve that once instead of eleven times, and it means the null rule
 * (P1) is enforced by construction — every number here goes through
 * `MetricGrid`, which cannot print a bare dash.
 *
 * The one design decision worth defending: **when `href` is set, tapping the
 * card body navigates.** We deliberately did NOT turn a list row into an
 * expand/collapse toggle. Opening a live is the streamer's most frequent
 * gesture (~20 a week); making it a two-tap affair to save a navigation is a
 * bad trade. Expansion, when a card needs it, is a nested `Disclosure` *inside*
 * the card, and anything interactive (`action`, `footer`) renders as a sibling
 * of the link, never inside it — the pattern `RemarksInput` already uses on
 * Home. Nesting a button or a `<details>` inside an `<a>` is invalid HTML and,
 * more to the point, it makes the whole card unpredictable under a thumb.
 *
 * One constraint that comes with that nested `Disclosure`: globals.css forces
 * `.lm-sec` open at `lg` (P5), so a card rendered at desktop width shows every
 * `detail` metric expanded. That is correct where cards belong — inside the
 * `lg:hidden` half of `MobileTable` — and wrong anywhere a card is the only
 * rendering of a row at every width. If a route has no desktop table to pair
 * with, put the numbers in `primary` and leave `detail` empty rather than
 * shipping a card that unfolds itself on a laptop.
 *
 * `id` lands on the outer element on purpose: `SessionHighlighter` adds
 * `.session-flash` to whatever carries `#session-<id>` after a save, and the
 * globals.css card rule animates that element's own background. So the outer
 * element owns the background and the inner sections stay transparent —
 * otherwise the flash would be painted over and the streamer would once again
 * see nothing after saving.
 *
 * Two things here look like paranoia and are not. The `tone` rail is 3px of
 * colour and nothing else, so on a card with no `status` chip it is the sole
 * carrier of "this one needs you" — colour alone, which is WCAG 1.4.1 and which
 * a hidden word fixes for the cost of nothing. And every caller-supplied string
 * gets `break-words`: these lists carry emails (`users-editor`), handles and
 * audit payload keys, and one unbreakable token in a `min-w-0` flex child is
 * how a 375px page starts panning sideways — the exact failure P6 tests for.
 */

export type RecordCardProps = {
  /** e.g. `session-${s.id}` — the scroll anchor and the SessionHighlighter target. */
  id?: string;
  /** When present the whole card body is a `<Link>` and a tap anywhere navigates. */
  href?: string;
  /**
   * Client callers only. Ignored when `href` is set (the link wins). Note the
   * body becomes a `<button>`, so `title` / `meta` / `badges` must stay
   * non-interactive here for the same reason they must under `href`.
   */
  onClick?: () => void;
  /**
   * The 3px left rail. `warn` / `good` also emit a hidden word for a screen
   * reader when no `status` chip is present — see the note at the top.
   */
  tone?: "neutral" | "warn" | "good";
  title: React.ReactNode;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  status?: { label: string; tone: "amber" | "emerald" | "zinc" | "rose" };
  /** Rendered OUTSIDE the link, below the body. Own your own 44px target. */
  action?: React.ReactNode;
  /** Up to 3 metrics, inline in the card body. */
  primary?: MetricItem[];
  /** The rest, inside a nested collapsed `Disclosure`. */
  detail?: MetricItem[];
  detailLabel?: string;
  /** Full-width links, e.g. `@handle →`. Own your own 44px target, as `action` does. */
  footer?: React.ReactNode;
};

type CardTone = NonNullable<RecordCardProps["tone"]>;

const RAIL: Record<CardTone, string> = {
  neutral: "border-l-zinc-300 dark:border-l-zinc-700",
  warn: "border-l-amber-400 dark:border-l-amber-500",
  good: "border-l-emerald-400 dark:border-l-emerald-500",
};

/**
 * Spoken ahead of the title so a queue announces "Needs attention, Sat 14 Sep
 * …". Only emitted when the card has no `status` chip: where there is one it
 * already says the same thing in ink, and repeating it on 63 rows is its own
 * kind of noise. `neutral` says nothing because it means nothing.
 */
const TONE_LABEL: Record<CardTone, string | null> = {
  neutral: null,
  warn: "Needs attention",
  good: "Complete",
};

const STATUS: Record<NonNullable<RecordCardProps["status"]>["tone"], string> = {
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
};

const SECTION = "border-t border-zinc-100 dark:border-zinc-800";

/**
 * Two columns is as dense as P6 allows below `sm`, and it is the default. But a
 * metric that carries a denominator — "from 9 of 63 lives", the strings that
 * today get `truncate`d out of existence at 11px — needs the full card width to
 * wrap into, and so does a hero number. Those loosen to one column rather than
 * clip. Loosening is always legal; tightening past two is not.
 */
function colsFor(items: MetricItem[]): 1 | 2 {
  if (items.length === 1) return 1;
  return items.some((m) => m.denominator || m.hero) ? 1 : 2;
}

export function RecordCard({
  id,
  href,
  onClick,
  tone = "neutral",
  title,
  meta,
  badges,
  status,
  action,
  primary,
  detail,
  detailLabel,
  footer,
}: RecordCardProps): React.JSX.Element {
  const titleId = id ? `${id}-title` : undefined;
  const toneLabel = status ? null : TONE_LABEL[tone];
  const tappable = Boolean(href || onClick);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* `tabular-nums` because these titles are overwhelmingly timestamps
              (`fmtWhen(s.startedAt)`) and a column of them that does not line up
              reads as noise; it is inert on titles with no digits. */}
          <div
            id={titleId}
            className="break-words text-[15px] font-medium leading-snug tabular-nums"
          >
            {toneLabel && <span className="sr-only">{toneLabel}, </span>}
            {title}
          </div>
          {meta && (
            <div className="mt-1 break-words text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {meta}
            </div>
          )}
          {badges && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div>
          )}
        </div>
        {status && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              STATUS[status.tone]
            }`}
          >
            {status.label}
          </span>
        )}
        {/* Shown for `onClick` cards too, not just `href` ones. A thumb has no
            hover, so the chevron is the only thing that distinguishes a card
            that does something when tapped from one that does not. */}
        {tappable && (
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 select-none text-zinc-300 dark:text-zinc-600"
          >
            &rsaquo;
          </span>
        )}
      </div>

      {primary && primary.length > 0 && (
        <div className={`mt-3 ${SECTION}`}>
          <MetricGrid items={primary} cols={colsFor(primary)} />
        </div>
      )}
    </>
  );

  const bodyCls = "block w-full min-h-14 rounded-2xl p-4 text-left";
  /**
   * `dark:active:bg-zinc-800`, NOT the `dark:active:bg-zinc-900` the tap-target
   * table gives for a row: that recipe assumes a row sitting on the page
   * background, and this card's own surface *is* `dark:bg-zinc-900`. Reusing it
   * here paints the press state in the colour it is pressed against — the class
   * is present, P2 looks satisfied in a grep, and a thumb in dark mode gets no
   * feedback at all on the app's most-tapped surface.
   *
   * `ring-inset` for a different reason: the card is `overflow-hidden` (it has
   * to be, or the section hairlines square off its rounded corners), so an
   * offset ring would be clipped away exactly where it matters.
   */
  const pressCls =
    "active:bg-zinc-50 dark:active:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500";

  return (
    <article
      id={id}
      aria-labelledby={titleId}
      className={`scroll-mt-24 overflow-hidden rounded-2xl border border-l-[3px] border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${RAIL[tone]}`}
    >
      {href ? (
        <Link href={href} className={`${bodyCls} ${pressCls}`}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={`${bodyCls} ${pressCls}`}>
          {body}
        </button>
      ) : (
        <div className={bodyCls}>{body}</div>
      )}

      {/* `action` sits ABOVE `detail` on purpose. It is the one thing on the
          card a thumb is meant to reach without reading further, and if it were
          below the disclosure it would slide down the screen the moment someone
          opened "All numbers" — the affordance moving as a side effect of an
          unrelated tap. It is also the order the prop list documents, and the
          order route owners were handed. */}
      {action && (
        <div
          className={`flex min-h-14 flex-wrap items-center justify-end gap-2 px-4 py-2 ${SECTION}`}
        >
          {action}
        </div>
      )}

      {detail && detail.length > 0 && (
        <div className={SECTION}>
          {/* No padding wrapper here: `Disclosure` already pads its own body,
              and its summary's px-4 lines this section up with the card's p-4
              body above it. */}
          <Disclosure title={detailLabel ?? "All numbers"}>
            <MetricGrid items={detail} cols={colsFor(detail)} />
          </Disclosure>
        </div>
      )}

      {footer && (
        <div
          className={`flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm ${SECTION}`}
        >
          {footer}
        </div>
      )}
    </article>
  );
}

export type RecordListProps = {
  children: React.ReactNode;
  /**
   * One sentence about what a blank means on THIS list, e.g. "Not entered means
   * nobody has typed that number in yet." Never write it as `— not entered`:
   * below `lg` a null renders as the words "Not entered" (P1) and there is no
   * dash on screen for the legend to be explaining. The dash only ever exists
   * inside `hidden lg:block`, where this component is not.
   */
  legend?: string;
};

/**
 * The container. Its only real job is the `legend` — what a blank means is a
 * fact about the whole list, so it is stated once at the top instead of being
 * repeated on every row, which is what the old tables did with a `title=`
 * attribute a thumb can never reach.
 */
export function RecordList({ children, legend }: RecordListProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      {/* `text-sm`, not `text-xs`: the legend is a sentence, and §2.1 bans a
          12px sentence below `lg` outright. It is the string that explains what
          every blank on the list means — setting it smaller than the numbers it
          qualifies is the exact failure (`streamer-home-feed.tsx:71` at 11px)
          this redesign exists to undo. */}
      {legend && (
        <p className="px-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {legend}
        </p>
      )}
      {children}
    </div>
  );
}
