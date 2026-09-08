import type { JSX } from "react";

import { NotEntered } from "@/components/mobile/not-entered";

/**
 * One metric, one row. This exists because the dense metric grids we ship today
 * stop being readable somewhere around 360px wide, and they fail in a way that
 * costs us real information rather than just looking cramped:
 *
 *  - `streamer-home-feed.tsx` puts five metrics in `grid-cols-5 gap-1`. On a
 *    375px phone that is ~60px per column, so "Filtered leads" wraps to three
 *    lines and every value below 1,000 looks like a different font size.
 *  - `live-analysis.tsx`'s seven cards carry an 11px `truncate` hint. The hint
 *    is where the honesty lives — `12 of 40 · from 6 lives` — and truncate
 *    deletes exactly the half that says how much of the period the number
 *    actually covers. The caveat disappears precisely on the device where the
 *    reader has the least context.
 *  - `overview-header.tsx`'s reach strip labels are 10px and truncated too.
 *
 * So the shape is deliberately boring: label left, value right, and the
 * denominator gets its own full-width 12px line that WRAPS. It never truncates,
 * because a qualifier you cannot finish reading is worse than no qualifier —
 * it reads as a complete number that happens to have some noise after it.
 *
 * Nulls go through `<NotEntered/>` and nowhere else (principle P1). A blank
 * leads field means nobody typed it yet; printing `0` or `—` turns a data-entry
 * gap into a public verdict about a named streamer. A recorded `0` still prints
 * `0` in full ink — that one is a real measurement and it should sting.
 *
 * `hero` is the escape valve for the one number a screen is actually about.
 * Max one per screen; that is a review rule, not something the code can check.
 *
 * Server component on purpose. These render inside `SessionsTable`,
 * `StreamerTable`, `TopLives` and `StreamerHomeFeed`, all of which are server
 * components holding up to ~500 rows. Adding state here would drag every one of
 * those rows across the client boundary a second time for zero interactivity.
 */

export type MetricItem = {
  label: string;
  value: string | number | null;
  /** e.g. "from 9 of 63 lives" — 12px, wraps, never truncates. */
  denominator?: string;
  tone?: "default" | "accent" | "warn";
  /** 28px value; at most ONE per screen. */
  hero?: boolean;
};

type MetricTone = NonNullable<MetricItem["tone"]>;

/**
 * `warn` is amber-**700**, not the amber-600 the rest of the app reaches for.
 * amber-600 on white is 3.0:1, and this class paints the metric *value* — a
 * 16px number that is the whole point of the row, not decoration around it, so
 * the 4.5:1 floor applies rather than the 3:1 large-text one. amber-700 is
 * 5.0:1 and still unmistakably amber. Dark mode keeps amber-400 (11.9:1).
 *
 * Colour is the only thing `tone` changes, which means it carries no meaning on
 * its own — a screen reader and a colour-blind reader both get the plain value.
 * That is deliberate: the reason a number is alarming belongs in `denominator`
 * ("0 of 12 — not recorded"), in words, where everyone can read it. Do not
 * promote `tone` into the only place a warning is stated.
 */
const TONE_VALUE: Record<MetricTone, string> = {
  default: "text-zinc-900 dark:text-zinc-100",
  accent: "text-blue-600 dark:text-blue-400",
  warn: "text-amber-700 dark:text-amber-400",
};

/**
 * A hyphen, any of the unicode dashes, a minus sign, an "n/a" spelling, or the
 * two words a broken number formatter produces. `nf(NaN)` is `"NaN"` and a
 * template hole over a null is `"null"`; both arrive here as ordinary strings
 * that would render in full ink beside a streamer's name.
 */
const PLACEHOLDER = /^(?:[-‐-―−]+|n\/?a|nan|null)$/i;

/**
 * Callers today all hand-roll `n.toLocaleString("en-MY")` before passing a
 * string down, so accepting a raw number and doing it here removes five copies
 * of that helper. A non-finite number (a rate that divided by zero, a NaN out
 * of a parse) is not a measurement either, so it takes the P1 path rather than
 * printing the word "NaN" next to a streamer's name.
 *
 * The placeholder guard is the part that is easy to mistake for paranoia. P1
 * claims this component *cannot* print a bare dash on a phone, and the six call
 * sites we are migrating all currently do `v == null ? "—" : nf(v)` at the call
 * site. Half a migration leaves that `"—"` being handed to us as a plain string,
 * and without this branch it renders — silently defeating the one rule the
 * component exists to enforce. `undefined` is here for the same reason: the type
 * forbids it, but rows arrive from untyped JSON and a missing key would render
 * as nothing at all, which reads as a blank cell rather than as "Not entered".
 */
function renderValue(value: MetricItem["value"] | undefined) {
  if (value == null) return <NotEntered />;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return <NotEntered />;
    return value.toLocaleString("en-MY");
  }
  const trimmed = value.trim();
  if (trimmed === "" || PLACEHOLDER.test(trimmed)) return <NotEntered />;
  return value;
}

export function MetricLine({
  label,
  value,
  denominator,
  tone = "default",
  hero = false,
}: MetricItem): JSX.Element {
  const valueCls = hero
    ? "text-[28px] font-semibold leading-none tabular-nums"
    : "text-base font-medium tabular-nums";

  return (
    // min-w-0 on the row itself, not only on the label: as a `grid-cols-2` item
    // this box would otherwise size to its own min-content and spill past a
    // 187px track, and an overflowing grid item is exactly the horizontal page
    // scroll P6 tests for at 375px.
    <div className="flex min-h-12 w-full min-w-0 flex-col justify-center gap-1 py-2">
      <div className="flex items-baseline justify-between gap-3">
        {/* min-w-0 so a long label wraps instead of shoving the value off the
            right edge — P6 forbids horizontal scroll at 375px. */}
        <span className="min-w-0 break-words text-sm text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        {/* shrink-0 keeps the number whole while the label wraps — that is the
            right priority nine rows in ten. `max-w-full break-words` is the
            floor under it: `shrink-0` alone means a value wider than its own
            grid track (a 28px `hero` beside a `cols={2}` 163px column, or any
            long formatted string) overflows the track instead of wrapping, and
            an overflowing grid item is the horizontal page scroll P6 tests for
            at 375px. Clamped to the track, `break-words` breaks it. Ugly, and
            deliberately so — a broken number is visibly wrong and gets fixed,
            a truncated one silently lies. Never swap this for `truncate`. */}
        <span
          className={`max-w-full shrink-0 break-words text-right ${valueCls} ${TONE_VALUE[tone]}`}
        >
          {renderValue(value)}
        </span>
      </div>
      {denominator && (
        // break-words, because these strings carry handles — `@adminain111 only`
        // — and an unbreakable token is wider than a two-column track. Wrapping
        // it is the whole point; `truncate` here would delete the caveat, which
        // is the failure this component was built to end. Never add one.
        <div className="break-words text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {denominator}
        </div>
      )}
    </div>
  );
}

export type MetricGridProps = {
  items: MetricItem[];
  cols?: 1 | 2;
};

/**
 * Stacks `MetricLine`s. Two columns is the floor — anything tighter is what we
 * are replacing. Single column gets hairlines between rows instead of gaps,
 * because at one-per-row the rule is what tells you where a metric ends and its
 * denominator's owner begins.
 */
export function MetricGrid({ items, cols = 1 }: MetricGridProps): JSX.Element {
  const gridCls =
    cols === 2
      ? "grid grid-cols-2 gap-x-4 gap-y-1"
      : "grid grid-cols-1 divide-y divide-zinc-100 dark:divide-zinc-800";

  return (
    <div className={gridCls}>
      {items.map((item, i) => (
        <MetricLine key={`${item.label}-${i}`} {...item} />
      ))}
    </div>
  );
}
