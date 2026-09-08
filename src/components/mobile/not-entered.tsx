import type { JSX } from "react";

/**
 * The one place in the app that decides what a missing number looks like.
 *
 * Leads sit on roughly 19% of lives while duration sits on 100%, so a blank is
 * not an edge case here - it is most of the manual columns most of the time.
 * That is why null -> 0 is the one substitution we never make: a live where
 * nobody has typed the leads in yet would read as a live that produced no
 * leads, which turns a data-entry gap into a public verdict about a named
 * streamer. A recorded 0 is a real measurement and still renders as 0, in full
 * ink; only the absence of an answer renders through here.
 *
 * We used to say this in prose - four separate statements across data-quality,
 * two overview chart footnotes and a hover-only title on Top lives, each
 * explaining that a dash is not a zero. None of them were reachable with a
 * thumb (a native `title` has no touch equivalent), and none of them sat next
 * to the blank they were about. Rendering the words "Not entered" puts the rule
 * where the reader already is and lets those paragraphs go; the longer version
 * survives as METRIC_HELP.notRecorded, behind the screen's single HelpChip. No
 * "?" trigger and no tooltip lives here: below `lg` there are zero inline help
 * icons by design, and the "not entered" legend belongs once to RecordList's
 * header - never to every blank on the page.
 *
 * Two variants, and the split is the whole trade-off:
 *
 *  - `text` is the only legal form on a mobile surface. It costs more pixels
 *    than a dash, which is precisely the point - on a phone we are choosing to
 *    spend room on being unambiguous.
 *  - `dash` exists ONLY so a `hidden lg:block` desktop table cell keeps
 *    rendering exactly what it renders today. A 22-column sessions row cannot
 *    carry "Not entered" a dozen times and stay scannable, and desktop in this
 *    redesign is additive-only: no existing layout gets worse. Reaching for
 *    `dash` below `lg` is the one way to misuse this component.
 *
 * The dash carries `role="img"` beside its aria-label. On a bare <span> an
 * aria-label is ignored by most screen readers, so the reader who cannot see
 * that the cell is dimmed would hear "em dash", or nothing at all - the exact
 * group the convention fails hardest. With the role, the glyph announces as the
 * words everyone else is expected to infer from it.
 *
 * Two deliberate deviations from the spec's literal snippet, both so that P1 and
 * P5 stay true rather than merely quoted:
 *
 * 1. The text variant is `text-zinc-500 dark:text-zinc-400`, not the spec's
 *    inverted pair. zinc-400 on white is 2.6:1 and zinc-500 on zinc-950 is
 *    4.1:1 - both under the 4.5:1 AA floor for 14px body text, and this is
 *    italic 14px read one-handed in daylight, the worst case we have. Swapping
 *    the pair puts both themes over the floor (4.8:1 / 7.8:1) while staying a
 *    full step lighter than a real value, so the blank still reads as
 *    subordinate, and it lands on exactly the pair MetricLine already uses for
 *    its labels. P1 only works if the words can actually be read.
 *
 * 2. A plain `text-*` colour in `className` REPLACES the variant's colour
 *    instead of joining it. Tailwind resolves two competing colours by
 *    stylesheet order, not by the order they appear in the attribute, so "just
 *    append yours" is a coin flip. That matters most on desktop: today's dash is
 *    a bare string that INHERITS its cell, and the cells disagree
 *    (`sessions-table` totalLeads is `text-indigo-600 dark:text-indigo-400
 *    font-semibold`, most others are `text-zinc-500`, some are default ink).
 *    Repainting all of them zinc-400 is a visible desktop change, not parity -
 *    exactly what P5 forbids. Handing the cell's own colour (or `text-current`)
 *    to `className` now deterministically wins.
 */

export type NotEnteredProps = {
  /**
   * `dash` is ONLY legal inside a `hidden lg:block` desktop table cell. Below
   * `lg` it is the one way to misuse this component: a bare glyph is precisely
   * the ambiguity P1 exists to remove.
   */
  variant?: "text" | "dash";
  /**
   * Joined onto the variant's own classes. Layout is the everyday use
   * (`block`, `ml-auto`, `shrink-0`).
   *
   * A plain `text-<hue>-<shade>`, `text-current` or `text-inherit` here also
   * REPLACES the variant's colour, which is how a desktop cell keeps its ink -
   * see deviation 2 above. Two things it does not detect, both of which fall
   * back to the unpredictable collision: a `dark:`-only override (pass an
   * unprefixed colour as well) and an arbitrary value like `text-[#a1a1aa]`.
   */
  className?: string;
};

/**
 * Matches an unprefixed Tailwind text-COLOUR utility and nothing else: sizes
 * (`text-sm`, `text-base`, `text-[28px]`) and alignment (`text-right`) must not
 * trip it, or a caller asking for a size would silently strip our colour. Both
 * important forms are allowed - v3's `!text-x` and v4's `text-x!`.
 */
const CALLER_SETS_COLOUR =
  /(?:^|\s)!?text-(?:inherit|current|transparent|black|white|[a-z]+-\d{2,3})(?:\/\d{1,3})?!?(?=\s|$)/;

export function NotEntered({ variant = "text", className }: NotEnteredProps): JSX.Element {
  const extra = className?.trim() ?? "";
  const ownColour = CALLER_SETS_COLOUR.test(extra);

  if (variant === "dash") {
    const cls = [ownColour ? "" : "text-zinc-400", extra].filter(Boolean).join(" ");
    return (
      <span role="img" aria-label="Not entered" className={cls || undefined}>
        {"\u2014"}
      </span>
    );
  }

  const cls = [
    "text-sm italic",
    ownColour ? "" : "text-zinc-500 dark:text-zinc-400",
    extra,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={cls}>Not entered</span>;
}
