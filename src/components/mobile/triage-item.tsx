import Link from "next/link";

/**
 * The admin queue row. Everything an admin is expected to *act on* renders as
 * one of these, stacked in severity order, so "what needs me?" is answered by
 * scanning one column instead of four differently-shaped boxes.
 *
 * Today the same job is done four different ways, and three of them are
 * unusable with a thumb:
 *
 *  - the tracker-health banner (`admin/tiktok/page.tsx`) is a full-width tinted
 *    block with nothing to tap, so it reads as decoration even when it is the
 *    most urgent thing on the page;
 *  - `MismatchAlerts` rows put the only navigation on a ~14px `@handle` link
 *    and the Dismiss on a 24px text button, 8px apart;
 *  - the `DataQuality` chase list — the single most actionable list in the
 *    whole app — is a ~20px text link whose caveat is set at 11px *underneath*
 *    the number it qualifies;
 *  - `overview-header`'s three stacked amber `Notice` paragraphs are 3–4 lines
 *    each and stand between the manager and the numbers they came for.
 *
 * So the row itself is the tap target (`min-h-16`, whole body), the severity
 * lives in a 3px rail rather than in a tinted card, and the caveat gets body
 * size (14px) on its own wrapping line instead of the 10–11px it is set at
 * today — and it is never truncated, which is the failure that currently hides
 * `12 of 40 · from 6 lives` on exactly the screens that need it.
 *
 * **Why the trailing controls are padded away from the row.** A row can carry
 * three tap targets: navigate (the body), act, and dismiss. Two of those are
 * one-way — Dismiss hides a mismatch alert for good — so P2 wants 16px of dead
 * space between neighbouring targets. Flex siblings butt up against each other
 * by default, so the body's own `px-4` buys nothing here: the padding has to
 * sit in a non-tappable wrapper *between* the controls, which is what the
 * `pl-4` on each trailing slot is doing. Today's `MismatchAlerts` puts a 24px
 * Dismiss 8px from the only link on the row; this is the fix for that.
 *
 * **Why a rail and not a tinted card.** One amber block on a page reads as
 * urgent; ten of them read as wallpaper, and the chase list routinely produces
 * ten. Keeping the card neutral and colouring a 3px edge means severity still
 * scans down the left margin when the queue is long, and the title keeps full
 * contrast ink instead of amber-on-amber.
 *
 * **Why this file has no `"use client"`.** Most callers are server components
 * (the chase list, the tracker banner) and pay nothing for it; the ones that
 * pass `onAction`/`onDismiss` are already client components (`MismatchAlerts`
 * owns its localStorage dismissals), and importing this module from a client
 * component pulls it into that bundle on its own. Adding the directive here
 * would drag the server callers across the boundary for no reason.
 */

export type TriageTone = "rose" | "amber" | "blue" | "emerald";

export type TriageItemProps = {
  tone: TriageTone;
  /** 15px. Lead with the number — "12,340 views · @kaimarketing", not "Missing numbers". */
  title: string;
  /** 14px, wraps. The caveat or the fix, one clause. */
  detail?: string;
  href?: string;
  actionLabel?: string;
  /** Client callers only. */
  onAction?: () => void;
  /** Client callers only. Renders a 44px icon button outside the row's link. */
  onDismiss?: () => void;
};

/** Severity reads down the left margin, so the rail is the only coloured part. */
const RAIL: Record<TriageTone, string> = {
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
};

/**
 * The rail is a 3px block of colour and nothing else, so on its own it says
 * "severity" to a sighted reader and absolutely nothing to a screen reader —
 * colour as the sole carrier of meaning (WCAG 1.4.1). One hidden word restores
 * it, read ahead of the title so a queue announces "Urgent, 12,340 views …".
 */
const TONE_LABEL: Record<TriageTone, string> = {
  rose: "Urgent",
  amber: "Needs attention",
  blue: "For information",
  emerald: "Resolved",
};

const BODY_BASE = "flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left";
const BODY_TAPPABLE =
  "active:bg-zinc-50 dark:active:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500";

export function TriageItem({
  tone,
  title,
  detail,
  href,
  actionLabel,
  onAction,
  onDismiss,
}: TriageItemProps): React.JSX.Element {
  // Exactly one primary tap per row: navigation if there is somewhere to go,
  // otherwise the action. A row with neither is a standing notice (the tracker
  // banner), and it gets no active/focus treatment because there is nothing to
  // press — a fake affordance is worse than none.
  //
  // Truthy rather than `!= null`, because callers build these hrefs
  // conditionally and an empty string is where that lands when there is no
  // session to point at. `href=""` is a perfectly valid link: it would draw a
  // chevron, take an active: state, and reload the page the admin is already
  // on. Empty means nowhere.
  const isLink = typeof href === "string" && href.length > 0;
  const isButton = !isLink && onAction != null;

  // `actionLabel` only becomes a real button when the row's own tap is already
  // spoken for by `href`; otherwise it is the label of the row itself, so it
  // renders as trailing text inside the tappable body.
  const separateAction = isLink && onAction != null;

  // Everything below lives inside a <button> or an <a>, whose content model is
  // phrasing content — hence <span class="block"> rather than <div>. The
  // trailing `actionLabel` is suppressed on the standing-notice branch: blue
  // text that does not respond to a tap is a lie, and the same reasoning that
  // denies that branch an active: state denies it a pretend link.
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="sr-only">{TONE_LABEL[tone]}. </span>
        {/* `tabular-nums` on both lines, not just the title: a queue is read as
            a column, and both slots are contractually number-led ("12,340 views
            · @kai", "recorded on 12 of 63 lives"). Proportional digits make ten
            stacked rows jitter. It only affects digits, so the prose around
            them is untouched. */}
        <span className="block break-words text-[15px] font-medium leading-snug tabular-nums">
          {title}
        </span>
        {detail ? (
          <span className="mt-0.5 block break-words text-sm leading-relaxed tabular-nums text-zinc-500 dark:text-zinc-400">
            {detail}
          </span>
        ) : null}
      </span>
      {actionLabel && !separateAction && (isLink || isButton) ? (
        <span className="shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400">
          {actionLabel}
        </span>
      ) : null}
      {isLink ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-zinc-400"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-16 items-stretch overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* `items-stretch` above is what makes this rail full-bleed without an
          absolute position: it is a plain flex child that inherits the row's
          height, so it grows with a three-line detail instead of being clipped
          to one. */}
      <span aria-hidden="true" className={`w-[3px] shrink-0 ${RAIL[tone]}`} />

      {isLink ? (
        <Link href={href} className={`${BODY_BASE} ${BODY_TAPPABLE}`}>
          {body}
        </Link>
      ) : isButton ? (
        <button
          type="button"
          onClick={onAction}
          className={`${BODY_BASE} ${BODY_TAPPABLE}`}
        >
          {body}
        </button>
      ) : (
        <div className={BODY_BASE}>{body}</div>
      )}

      {/* `pl-4` is the 16px of dead space between the row's own tap target and
          this one (P2); `pr-4` matches the body's inset when this is the last
          thing in the row. Padding on the wrapper, not the button, so the
          button stays exactly 44px of tappable surface. */}
      {separateAction ? (
        <span className="flex shrink-0 items-center pl-4 pr-4">
          <button
            type="button"
            onClick={onAction}
            // The visible label is the same word on every row of a queue, so on
            // its own it announces "Open, Open, Open…". Prefixing keeps WCAG
            // 2.5.3 (accessible name starts with the visible label) while
            // telling a screen-reader user *which* row they are about to act on
            // — the same treatment the Dismiss button below already gets.
            aria-label={`${actionLabel ?? "Open"}: ${title}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-zinc-700 dark:active:bg-zinc-800"
          >
            {/* Callers should always pass actionLabel with onAction; "Open" is
                only here so a missing label can never ship a nameless button. */}
            {actionLabel ?? "Open"}
          </button>
        </span>
      ) : null}

      {/* Dismiss is the one control here that cannot be undone, so it gets 16px
          of dead space on its left from whatever precedes it — the action slot
          already supplies that when both are present, so doubling up would push
          the text column to ~215px on a 375px screen for no benefit.

          `ring-inset`, not a plain ring: the card is `overflow-hidden` and this
          button sits at its right edge, so an outset ring would be clipped
          exactly where a keyboard user needs to see it. */}
      {onDismiss ? (
        <span
          className={`flex shrink-0 items-center pr-1 ${separateAction ? "" : "pl-4"}`}
        >
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss: ${title}`}
            // zinc-500, not zinc-400: this glyph is the *only* thing that says
            // what the button does, which makes it a WCAG 1.4.11 graphical
            // object needing 3:1. zinc-400 on white is 2.6:1 — the chevron can
            // stay that light because it is decorative and aria-hidden, this
            // cannot. In dark mode zinc-400 is already ~9:1, so it stays.
            className="inline-flex h-11 w-11 select-none items-center justify-center rounded-lg text-zinc-500 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:text-zinc-400 dark:active:bg-zinc-800"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>
      ) : null}
    </div>
  );
}
