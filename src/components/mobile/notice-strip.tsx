/**
 * One line of standing caveat, with the rest one tap away.
 *
 * The overview page currently opens with three stacked amber paragraphs of
 * three to four lines each (`overview-header.tsx:184`), and the data-quality
 * page adds two more boxes on top of its own prose. On a 375px screen that is
 * most of the first viewport spent on sentences before a single number is
 * visible — so the caveats get scrolled past, which is the one thing a caveat
 * must not be. Deleting them is not an option either: they are the difference
 * between "this streamer got no leads" and "nobody typed this streamer's leads
 * in", and that difference is about a named person.
 *
 * So: the FACT stays on screen permanently — the highest-priority `short`
 * clause, plus `(+2)` so nobody thinks that is all there is — and the RATIONALE
 * goes behind one 48px tap. Same information, one line instead of twelve.
 *
 * Two things worth knowing about the shape:
 *
 *  - It is a `<details>`, so the collapse costs no JavaScript and works in a
 *    server component. Nothing here crosses the client boundary; the overview
 *    header stays a server render.
 *  - Desktop is a sibling (`hidden lg:block`), not the same tree with a media
 *    query. It has to be: `short` and `full` are genuinely different strings,
 *    and desktop has always shown the whole thing at once with no chevron to
 *    click. Duplicating four short paragraphs is cheaper than pretending one
 *    tree can be both. The desktop promise therefore rests on a branch that is
 *    simply always expanded, not on the `lm-sec` lg override — `lm-sec` is on
 *    the phone `<details>` only for the marker-hiding and body toggle it gives
 *    every collapsible in the app, and that branch is `lg:hidden`, so the lg
 *    half of the rule never runs here.
 *  - Severity ordering is a phone-only decision. It exists to pick which single
 *    clause gets the standing line; desktop shows all of them at once, so there
 *    is nothing to pick and re-sorting there would only move DOM that P5 says
 *    must not move. Desktop keeps the caller's order.
 *
 * Rule NP-4 lives here by construction: a notice must never end up inside a
 * collapsed section or a background pane, so this renders at the top level of a
 * route, above `PaneSwitcher`. It has no outer margin — the route's own
 * `space-y-3` stack owns the spacing.
 */

export type NoticeItem = {
  key: string;
  short: React.ReactNode;
  full?: React.ReactNode;
  tone?: "amber" | "blue" | "rose";
};

type Tone = NonNullable<NoticeItem["tone"]>;

/** Severity order for the one clause that gets the standing line. */
const RANK: Record<Tone, number> = { rose: 0, amber: 1, blue: 2 };

const TONE: Record<Tone, { box: string; press: string; rail: string }> = {
  rose: {
    box: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200",
    press: "active:bg-rose-100 dark:active:bg-rose-900/40",
    rail: "border-rose-400 dark:border-rose-700",
  },
  amber: {
    box: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    press: "active:bg-amber-100 dark:active:bg-amber-900/40",
    rail: "border-amber-400 dark:border-amber-700",
  },
  blue: {
    box: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300",
    press: "active:bg-blue-100 dark:active:bg-blue-900/40",
    rail: "border-blue-400 dark:border-blue-700",
  },
};

// Inset, not offset: the summary is clipped by the `<details>`'s own
// `overflow-hidden` (which is what keeps its `active:` fill inside the rounded
// border), and an outward ring would be clipped along with it.
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500";

/**
 * Callers build their notice list conditionally (`misses > 0 && …`), so an
 * entry can arrive with nothing in it. An empty clause must not take a line,
 * and must never be the one that wins the standing summary.
 */
function hasContent(node: React.ReactNode): boolean {
  return !(node == null || node === false || node === true || node === "");
}

/**
 * Same defence as the `it != null` filter below, for the same reason: an unknown
 * tone would index `TONE` to `undefined`, and `undefined.box` is a 500 on the
 * whole route thrown by the caveat component. It would also turn the sort
 * comparator into `NaN`, which silently scrambles the order. One `in` check.
 */
function toneOf(item: NoticeItem): Tone {
  return item.tone != null && item.tone in TONE ? item.tone : "amber";
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lm-chev h-4 w-4 shrink-0 opacity-70 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
    >
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  );
}

/** One notice as it reads when there is room for all of it. */
function NoticeBody({ item }: { item: NoticeItem }) {
  return (
    <div className={`min-w-0 border-l-[3px] pl-3 ${TONE[toneOf(item)].rail}`}>
      {/* break-words, not truncate: these clauses carry handles (`@adminain111`)
          and ids that have no space to wrap at, and P6 says a 375px page never
          scrolls sideways. */}
      <p className="break-words text-sm leading-relaxed">{item.short}</p>
      {hasContent(item.full) ? (
        <p className="mt-1 break-words text-sm leading-relaxed opacity-80">{item.full}</p>
      ) : null}
    </div>
  );
}

export function NoticeStrip({ items }: { items: NoticeItem[] }): React.JSX.Element | null {
  // `it != null` is not paranoia about the type: callers build this list as
  // `[cond && {…}, other && {…}].filter(Boolean) as NoticeItem[]`, and a cast is
  // only as good as the expression under it. A `cond ? {…} : null` that slips
  // through would throw inside a server render — a 500 on the whole route,
  // caused by the caveat component. It costs one comparison to not do that.
  const live = items.filter((it) => it != null && hasContent(it.short));
  if (live.length === 0) return null;

  // Severity first, caller's order within a severity — so the rose "this is
  // wrong" clause wins the standing line over the blue "here's how to read it"
  // one, and two amber notices stay in the order the page decided.
  const ordered = live
    .map((item, i) => ({ item, i }))
    .sort((a, b) => RANK[toneOf(a.item)] - RANK[toneOf(b.item)] || a.i - b.i)
    .map((e) => e.item);

  const top = ordered[0];
  const rest = ordered.length - 1;
  const skin = TONE[toneOf(top)];

  // Nothing to reveal — one notice with no rationale. A chevron that opens onto
  // the sentence you just read is a lie about there being more, so it is a flat
  // strip instead.
  const collapsible = rest > 0 || hasContent(top.full);

  return (
    <div>
      {/* Phone: one standing clause, everything else one tap away. */}
      <div className="lg:hidden">
        {collapsible ? (
          <details className={`lm-sec group overflow-hidden rounded-xl border ${skin.box}`}>
            {/* `select-none`: a long press on a 48px toggle should open it, not
                start a text selection. The full clause is selectable in the
                body, so nothing becomes uncopyable. */}
            <summary
              className={`flex min-h-12 cursor-pointer list-none select-none items-center justify-between gap-3 px-4 py-3 ${skin.press} ${FOCUS}`}
            >
              <span className="min-w-0 flex-1 break-words text-sm leading-relaxed">
                {top.short}
                {rest > 0 ? (
                  <>
                    {" "}
                    <span className="whitespace-nowrap font-semibold tabular-nums" aria-hidden="true">
                      (+{rest})
                    </span>
                    <span className="sr-only">
                      , and {rest} more {rest === 1 ? "notice" : "notices"}
                    </span>
                  </>
                ) : null}
              </span>
              <Chevron />
            </summary>
            <div className="lm-body space-y-3 px-4 pb-4">
              {ordered.map((item) => (
                <NoticeBody key={item.key} item={item} />
              ))}
            </div>
          </details>
        ) : (
          <div className={`rounded-xl border px-4 py-3 ${skin.box}`}>
            <p className="break-words text-sm leading-relaxed">{top.short}</p>
          </div>
        )}
      </div>

      {/* Desktop: every notice open, no chevron, and in the order the page
          wrote them — `live`, not `ordered`. P5's test is "the DOM at ≥1024px is
          in the same order as before", and severity ranking only exists to
          choose the phone's standing line. Sorting here would move a rose notice
          above an amber one on a screen that already shows both. */}
      <div className="hidden space-y-2 lg:block">
        {live.map((item) => {
          const s = TONE[toneOf(item)];
          return (
            <div key={item.key} className={`rounded-lg border px-4 py-3 ${s.box}`}>
              <p className="text-sm leading-relaxed">{item.short}</p>
              {hasContent(item.full) ? (
                <p className="mt-1 text-sm leading-relaxed opacity-80">{item.full}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
