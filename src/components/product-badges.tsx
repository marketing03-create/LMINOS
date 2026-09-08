import { NotEntered } from "@/components/mobile/not-entered";

/**
 * Read-only badges for a session's tagged product(s) (or "Not entered" when
 * none - a dash on desktop, see below).
 *
 * These were 11px, which is the size a table cell talks you into: the badges
 * live in the `Product` column of a 22-column sessions row, and shrinking the
 * text is the cheapest way to buy that column back. The cost only shows up on a
 * phone, where the same component is the label under a live's timestamp in the
 * home feed and under the title on the detail page - 11px pills sitting beside
 * 14px copy, telling the reader which loan product this live was actually
 * about. `text-sm` puts them level with the line they qualify, which is the
 * type-scale rule that a caveat is never smaller than the thing it explains.
 *
 * `lg:text-xs lg:leading-[inherit]` is what keeps the table honest. The line
 * height is the part that matters: today's arbitrary 11px size sets a font
 * size and nothing else, so the badge inherits its row's 20px line box and the row is
 * exactly as tall as its neighbours. `text-sm` would carry its own `leading-5`
 * into the cell, and `text-xs` its own 16px - either one re-measures every
 * sessions row on the laptop for a change the laptop did not ask for (P5).
 * Inheriting hands that decision back to the row. The remaining 11px -> 12px on
 * desktop is deliberate and it is the smallest step available: the type scale
 * has no rung below `text-xs`, and 11px is banned outright rather than merely
 * discouraged.
 *
 * Wrapping is the other half. `flex-wrap` alone does not stop an overflow,
 * because as a flex item inside the feed card's own row this span's base width
 * is its content - it will happily push past 375px rather than wrap. `min-w-0
 * max-w-full` makes it shrinkable and therefore wrappable, and dropping
 * `nowrap` below `lg` lets a long label ("Cash Out Property" beside a second
 * badge in a narrow card) break as a last resort. Desktop keeps `nowrap`,
 * because in a table cell a two-line badge is worse than a wider column.
 *
 * The empty case is a pair of siblings rather than one string, and that is P1:
 * "no product tagged" is an absence, and an absence renders as words on a phone
 * and as today's dash inside a desktop table - a 22-column row cannot carry
 * "Not entered" and stay scannable. `NotEntered`'s dash keeps its own
 * `text-zinc-400`, which is the ink this rendered before, and carries the
 * `role="img"` + label that a bare em dash never had.
 */
export function ProductBadges({
  products,
}: {
  products: string[] | null | undefined;
}) {
  const list = (products ?? []).filter(Boolean);
  if (list.length === 0) {
    return (
      <>
        <span className="lg:hidden">
          <NotEntered />
        </span>
        <NotEntered variant="dash" className="hidden lg:inline" />
      </>
    );
  }
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap gap-1.5 lg:gap-1">
      {list.map((p) => (
        <span
          key={p}
          className="rounded-full bg-indigo-100 px-2 py-0.5 text-sm whitespace-normal text-indigo-700 lg:text-xs lg:leading-[inherit] lg:whitespace-nowrap dark:bg-indigo-950/40 dark:text-indigo-300"
        >
          {p}
        </span>
      ))}
    </span>
  );
}
