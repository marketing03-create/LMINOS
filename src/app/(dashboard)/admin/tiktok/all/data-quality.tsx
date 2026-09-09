import Link from "next/link";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import type { AnalysisSession } from "@/lib/tiktok-live/live-analysis-core";
import {
  AUTO_FIELDS,
  TYPED_FIELDS,
  chaseList,
  connectorMisses,
  coverage,
  productCombos,
  type Coverage,
} from "@/lib/tiktok-live/overview-core";
import { Disclosure } from "@/components/mobile/disclosure";
import { TriageItem } from "@/components/mobile/triage-item";
import { NotEntered } from "@/components/mobile/not-entered";

const fmtDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Inherits the cell it lands in, so today's desktop rows keep their exact ink. */
const dash = <NotEntered variant="dash" className="text-current" />;

const nf = (n: number) => n.toLocaleString("en-MY");

/**
 * What still needs filling in — at ~19% lead coverage this is the highest-value
 * section on the page, because no amount of extra charting beats getting the
 * numbers entered.
 *
 * The two groups are deliberately separated. Showing a green "Views 100%" chip
 * beside a red "Total Leads 19%" chip reads as "most of the funnel is measured,
 * one gap" — when in truth every automatic field is 100% by construction and
 * every commercially meaningful field is red. Only the first group is chase-able.
 *
 * Below `lg` the two panels swap places, and that is the whole redesign of this
 * section in one sentence: **the chase list comes first and the coverage bars go
 * behind a disclosure.** Coverage is a diagnosis; the chase list is the only
 * thing on this page an admin can actually do something about, and today it is
 * the second column of a two-column grid, which on a phone means it sits below
 * nine paragraphs of 11px explanation. Its rows become `TriageItem`s — the whole
 * row is the tap target instead of a ~20px date link, and the caveat under each
 * one is set at 14px instead of 11px, which is the size rule that exists
 * precisely because a caveat you cannot read is worse than no caveat.
 *
 * Nine paragraphs went. Every one of them was either a restatement of the `?`
 * standing right beside it (the automatic-capture caveat is `METRIC_HELP`
 * `autoCoverage` word for word), an instruction that renders identically against
 * an empty database ("chase these", "Tag lives with the product they promoted"),
 * or the "a blank is not zero leads" box — which is now said in ink, next to
 * every blank, by `NotEntered`. What did NOT go is a single number, denominator
 * or warning: the connector-miss flag, the incomplete count, every "N of M",
 * every percentage and the product-tagging finding are all still here, and the
 * hover-only ⚠ on a broken Filtered/Total pairing is now a visible label at both
 * widths, because a native `title` is unreachable with a thumb.
 */
export function DataQuality({ sessions }: { sessions: AnalysisSession[] }) {
  const typed = coverage(sessions, TYPED_FIELDS);
  const auto = coverage(sessions, AUTO_FIELDS);
  const { rows: chase, totalIncomplete } = chaseList(sessions);
  const misses = connectorMisses(sessions);
  const products = productCombos(sessions);

  if (sessions.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-1.5">
        <h2 id="data-quality" className="scroll-mt-28 text-lg font-semibold">
          Data quality
        </h2>
        <HelpTip text={METRIC_HELP.coverage} label="About data quality" />
      </div>

      {/* ── Desktop: today's two-column grid, in today's order ───────────── */}
      <div className="hidden lg:block">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── (a) Coverage ───────────────────────────────────────────── */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Typed in by people</h3>
            </div>
            <ul className="mb-5 space-y-1.5">
              {typed.map((c) => (
                <CoverageRow key={c.key} c={c} />
              ))}
            </ul>

            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Captured automatically</h3>
              <HelpTip text={METRIC_HELP.autoCoverage} label="About automatic capture" />
            </div>
            <ul className="space-y-1.5">
              {auto.map((c) => (
                <CoverageRow key={c.key} c={c} />
              ))}
            </ul>

            {/* ── (b) Connector-miss flag ─────────────────────────────── */}
            {misses > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                {misses} live{misses === 1 ? "" : "s"} drew views but recorded no
                likes or comments — that looks like the capture worker going quiet
                rather than a silent room. If it keeps happening, the{" "}
                <code className="font-mono">lmiros-tiktok</code> tracker may need a
                restart.
              </p>
            )}

            {/* ── (d) Product tagging ─────────────────────────────────── */}
            <div className="mt-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">Product tagging</span>
                <HelpTip text={METRIC_HELP.productTagging} label="About product tagging" />
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                {productSentence(products)}
              </p>
            </div>
          </div>

          {/* ── (c) Chase list ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-1 flex items-center gap-1.5">
              <h3 className="text-sm font-semibold">Lives still missing numbers</h3>
              <HelpTip text={METRIC_HELP.chaseList} label="About this list" />
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
              {/* {" "} is required: a JSX text node that wraps to the next line
                  has each of its lines trimmed, so the leading space would be
                  eaten and this would read "72lives". */}
              {totalIncomplete} of {sessions.length}{" "}
              lives (5 minutes or longer) are missing at least one number. Biggest
              audience first — that&apos;s the order to work through them.
            </p>

            {chase.length === 0 ? (
              <div className="grid place-items-center rounded-lg border border-dashed border-emerald-300 p-6 text-center text-xs text-emerald-700 dark:border-emerald-900 dark:text-emerald-400">
                Every live in this period has its numbers filled in.
              </div>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {chase.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-zinc-100 pb-1.5 last:border-0 dark:border-zinc-900"
                    >
                      <Link
                        href={`/tiktok-live/${r.id}`}
                        className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {r.startedAt ? fmtDate.format(new Date(r.startedAt)) : dash}
                        <span className="ml-1.5 font-mono font-normal text-zinc-400">
                          @{r.handle}
                        </span>
                      </Link>
                      <span className="text-[11px] text-zinc-500">
                        {r.totalViews == null ? dash : nf(r.totalViews)} views ·{" "}
                        <span className="text-amber-600 dark:text-amber-400">
                          {r.missing.join(", ")} not entered
                        </span>
                        {/* Was a "⚠" carrying its only explanation in a native
                            `title`, which no thumb can open and no screen reader
                            reliably announces. The words are the label now. */}
                        {r.filteredWithoutTotal && (
                          <span className="ml-1.5 text-rose-600 dark:text-rose-400">
                            Filtered without Total
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {totalIncomplete > chase.length && (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    …and {totalIncomplete - chase.length} more.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Below lg: the chase queue first, then the coverage diagnosis ──
          This component owns BOTH surfaces of the chase list. `/admin/tiktok/all`
          only reads `chaseList(slim).totalIncomplete` for its pane chip and
          renders the "How to read this queue" `HelpChip` after us — it does not
          build the queue, so if we skipped it below `lg` the connector-miss
          warning, the incomplete count, all ten actionable rows and the
          `Filtered without Total` flag would exist on desktop and nowhere else.
          Spec 5.11's pane order is: the triage rows, then `Disclosure
          "Coverage"` collapsed. Coverage is a diagnosis; the queue is the only
          thing on this page an admin can act on, so it goes first.

          Every string here is built from the same `chaseList` / `connectorMisses`
          call the desktop panel above uses — one computation, two renderings,
          so the two can never disagree about a number. */}
      <div className="lg:hidden">
        <div className="mb-6 space-y-3">
          <h3 className="text-[17px] font-semibold">Lives still missing numbers</h3>
          <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {totalIncomplete} of {sessions.length} lives (5 minutes or longer) are
            missing at least one number. Biggest audience first.
          </p>

          {/* The connector-miss flag, in the queue's highest severity slot. The
              tracker's name stays in the words: it is the one string that tells
              whoever reads this WHICH worker to restart. */}
          {misses > 0 && (
            <TriageItem
              tone="rose"
              title={`${misses} live${misses === 1 ? "" : "s"} drew views but recorded no likes or comments`}
              detail="That looks like the capture worker going quiet rather than a silent room. If it keeps happening, the lmiros-tiktok tracker may need a restart."
            />
          )}

          {chase.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-emerald-300 p-6 text-center text-sm leading-relaxed text-emerald-700 dark:border-emerald-900 dark:text-emerald-400">
              Every live in this period has its numbers filled in.
            </div>
          ) : (
            <>
              {chase.map((r) => (
                <TriageItem
                  key={r.id}
                  tone="blue"
                  href={`/tiktok-live/${r.id}`}
                  title={`${
                    r.startedAt ? fmtDate.format(new Date(r.startedAt)) : "Time not recorded"
                  } · @${r.handle}`}
                  /* `Views not entered`, never "0 views" and never a bare dash:
                     this row exists BECAUSE numbers are missing, and printing a
                     zero here would be the exact substitution P1 forbids. The
                     `Filtered without Total` flag is words rather than the
                     desktop's rose ⚠ + native `title`, which no thumb opens. */
                  detail={[
                    r.totalViews == null
                      ? "Views not entered"
                      : `${nf(r.totalViews)} views`,
                    `Missing: ${r.missing.join(", ")}`,
                    ...(r.filteredWithoutTotal ? ["Filtered without Total"] : []),
                  ].join(" · ")}
                />
              ))}
              {totalIncomplete > chase.length && (
                <p className="px-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  …and {totalIncomplete - chase.length} more.
                </p>
              )}
            </>
          )}
        </div>

        <Disclosure title="Coverage" headingLevel={3}>
          <div className="space-y-5">
            <div>
              <h4 className="mb-1 text-sm font-semibold">Typed in by people</h4>
              <ul>
                {typed.map((c) => (
                  <CoverageBar key={c.key} c={c} />
                ))}
              </ul>
            </div>

            <div>
              {/* The caveat is folded into the heading rather than left as a
                  paragraph under the bars. It is the same point `autoCoverage`
                  makes behind the desktop `?` — there is no `?` down here, and
                  a fill rate you might read as a fill rate is the one thing on
                  this list that could actively mislead. */}
              <h4 className="mb-1 text-sm font-semibold">
                Captured automatically — a best case, not an exact count
              </h4>
              <ul>
                {auto.map((c) => (
                  <CoverageBar key={c.key} c={c} />
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <div className="text-sm font-semibold">Product tagging</div>
              <p className="mt-0.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {productSentence(products)}
              </p>
            </div>
          </div>
        </Disclosure>
      </div>
    </section>
  );
}

/**
 * One string, both widths, so the desktop panel and the phone disclosure can
 * never drift into saying different things about the same tags.
 *
 * The two imperatives that used to live in the middle of it are gone — "Tag
 * lives with the product they promoted and this page can start comparing them"
 * and "Tag lives with a single product from now on" are coaching that reads the
 * same whatever the data says. Both findings survive verbatim, because they are
 * the part that can be false: whether the tags are all one combination (so leads
 * cannot be split) or several (so they can).
 */
function productSentence(p: { combos: number; tagged: number; total: number }): string {
  const head = `${p.tagged} of ${p.total} lives tagged.`;
  if (p.tagged === 0) return head;
  if (p.combos <= 1)
    return `${head} Every tagged live promoted the same combination of products, so leads can't be split between them yet.`;
  return `${head} ${p.combos} different product combinations in use — enough to start comparing them.`;
}

/** Neutral for automatic fields — nobody can act on them, so no red/green. */
function toneFor(c: Coverage): string {
  if (c.kind === "auto" || c.pct == null) return "bg-zinc-400";
  if (c.pct < 40) return "bg-rose-500";
  if (c.pct < 90) return "bg-amber-500";
  return "bg-emerald-500";
}

/** Desktop only. `text-[11px]` survives here because moving it moves desktop. */
function CoverageRow({ c }: { c: Coverage }) {
  const pct = c.total > 0 ? (c.filled / c.total) * 100 : 0;
  return (
    <li className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-xs text-zinc-600 dark:text-zinc-400">
        {c.label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <span
          className={`block h-full rounded-full ${toneFor(c)}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
        {c.filled} of {c.total}
        {c.pct != null && c.kind !== "auto" && (
          <span className="ml-1 text-zinc-400">({c.pct}%)</span>
        )}
      </span>
    </li>
  );
}

/**
 * The same row below `lg`, stacked. The desktop version puts label, bar and
 * count on one line in three fixed columns, which at 375px leaves the bar about
 * 70px — narrow enough that 19% and 31% are the same picture, and the label
 * `truncate`s on top of that. Two lines costs 20px and keeps both readable.
 */
function CoverageBar({ c }: { c: Coverage }) {
  const pct = c.total > 0 ? (c.filled / c.total) * 100 : 0;
  return (
    <li className="min-h-11 py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 break-words text-sm text-zinc-600 dark:text-zinc-400">
          {c.label}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {c.filled} of {c.total}
          {c.pct != null && c.kind !== "auto" && (
            <span className="ml-1">({c.pct}%)</span>
          )}
        </span>
      </div>
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <span
          className={`block h-full rounded-full ${toneFor(c)}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </li>
  );
}
