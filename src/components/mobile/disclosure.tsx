import type { JSX } from "react";

/**
 * A section that collapses on a phone and is always open on a laptop — built on
 * `<details>` on purpose, not on `useState`.
 *
 * The reason is boring and load-bearing: almost every page that needs this is a
 * server component. `SessionsTable`, `StreamerTable`, `TopLives`, `DataQuality`,
 * `StreamerHomeFeed` and the overview page all render on the server today, and
 * making one of them collapsible with React state would mean `"use client"` on
 * the file — which drags up to 500 session rows across the boundary a second
 * time as serialised props, for the privilege of hiding them. `<details>` costs
 * zero hydration, zero bytes, and works before (and without) JavaScript.
 *
 * The "always open at lg" half lives in `globals.css` under `.lm-sec`, not here.
 * That rule forces the body to `display: block` and neuters the summary at
 * 1024px and up, which is the single mechanism that guarantees the desktop DOM
 * does not regress when a section becomes collapsible for the phone (P5). It is
 * CSS rather than a `lg:` prop because a prop can be forgotten at one call site;
 * a selector cannot.
 *
 * Two details in here look like fussiness and are not:
 *
 *  - The chevron rotates via `[[open]>summary>span>&]`, not `group-open:`.
 *    Tailwind compiles `group-open:` to a *descendant* match — `.group[open] *`
 *    — so a collapsed `RecordCard` "All numbers" disclosure sitting inside an
 *    open route-level one would inherit the parent's open state and point its
 *    arrow up while its own body is shut. That nesting is not hypothetical: §4.5
 *    mandates it for every card with `detail` metrics. A child-combinator chain
 *    can only ever match this `<details>`, so nesting stays honest, and nothing
 *    here carries `group` for someone else's `group-*` utility to catch on.
 *  - `cursor-pointer` is not decoration. iOS Safari refuses to apply `:active`
 *    to an element that is not obviously clickable, so dropping it would take
 *    the press feedback with it on exactly the devices this exists for.
 *
 * `headingLevel` is the one prop beyond §4.2's list, and it is here because the
 * markup this replaces is `<section><h2 id="reach">`. Rendering that title as a
 * bare span would quietly strip a real heading out of the desktop outline —
 * additive-only cuts both ways (P5). Route sections that own an outline pass 2
 * or 3; nested card disclosures pass nothing, because a list of forty cards
 * must not push forty headings into the outline.
 *
 * Known trade-off, accepted: `<details>` state does not survive a navigation, so
 * an admin coming back from a live detail page finds sections collapsed again.
 * `PaneSwitcher` — which does hold state — covers the one page where that loop
 * actually happens; everywhere else the cost is one tap and the benefit is not
 * shipping a client bundle to render a heading.
 *
 * Padding note for callers: this component owns its own 16px horizontal padding
 * on both the summary and the body, so the tap target can run edge to edge (P2).
 * Place it full-bleed — `-mx-4` inside a `px-4` page, or flush inside a card —
 * and do not wrap `children` in another `px-4`.
 */

export type DisclosureProps = {
  /** Becomes the <details> id, so existing hash anchors (#data-quality) still land. */
  id?: string;
  title: string;
  /** Right-aligned meta, e.g. "6 charts", "63 lives". Caller formats it. */
  count?: string;
  /** Maps to <details open>. Ignored at lg, where the body is always shown. */
  defaultOpen?: boolean;
  tone?: "default" | "warn";
  /**
   * Renders the title as a real heading. Off by default: a card's nested
   * "All numbers" disclosure must not put a hundred h2s into the outline.
   * Route-level sections that own a document outline pass 2 or 3.
   */
  headingLevel?: 2 | 3;
  children: React.ReactNode;
};

export function Disclosure({
  id,
  title,
  count,
  defaultOpen = false,
  tone = "default",
  headingLevel,
  children,
}: DisclosureProps): JSX.Element {
  const warn = tone === "warn";

  // One flex item, whatever element it turns out to be. It is a direct child of
  // <summary> in every branch: <summary> takes phrasing or heading content, so
  // wrapping a heading in a <span> (or anything in a <div>) would be invalid.
  const titleClass = `flex min-w-0 items-center gap-2 text-[17px] font-semibold ${
    warn ? "text-amber-700 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-100"
  }`;

  const titleInner = (
    <>
      {warn && (
        <>
          {/* The amber is the only cue a sighted reader gets; the dot is
              decorative, so the state has to be said out loud somewhere. */}
          <span className="sr-only">Attention: </span>
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
        </>
      )}
      {title}
    </>
  );

  const titleNode =
    headingLevel === 2 ? (
      <h2 className={titleClass}>{titleInner}</h2>
    ) : headingLevel === 3 ? (
      <h3 className={titleClass}>{titleInner}</h3>
    ) : (
      <span className={titleClass}>{titleInner}</span>
    );

  return (
    <details id={id} open={defaultOpen} className="lm-sec scroll-mt-28">
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 ${
          warn
            ? "active:bg-amber-50 dark:active:bg-amber-950/40"
            : "active:bg-zinc-50 dark:active:bg-zinc-900"
        }`}
      >
        {titleNode}

        <span className="flex shrink-0 items-center gap-2">
          {count && (
            <span className="whitespace-nowrap text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {count}
            </span>
          )}
          {/* `lm-chev` is hidden at lg by globals.css — at that width the summary
              is inert and a chevron would promise a toggle that does nothing. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lm-chev shrink-0 text-zinc-400 transition-transform duration-150 [[open]>summary>span>&]:rotate-180 motion-reduce:transition-none dark:text-zinc-500"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>

      <div className="lm-body px-4 pb-4 pt-2">{children}</div>
    </details>
  );
}
