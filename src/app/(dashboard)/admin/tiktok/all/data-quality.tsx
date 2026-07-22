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

const fmtDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * What still needs filling in — at ~19% lead coverage this is the highest-value
 * section on the page, because no amount of extra charting beats getting the
 * numbers entered.
 *
 * The two groups are deliberately separated. Showing a green "Views 100%" chip
 * beside a red "Total Leads 19%" chip reads as "most of the funnel is measured,
 * one gap" — when in truth every automatic field is 100% by construction and
 * every commercially meaningful field is red. Only the first group is chase-able.
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
      <div className="mb-1 flex items-center gap-1.5">
        <h2 id="data-quality" className="scroll-mt-28 text-lg font-semibold">
          Data quality
        </h2>
        <HelpTip text={METRIC_HELP.coverage} label="About data quality" />
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        How much of this period is actually measured. Everything above is only as
        good as this.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── (a) Coverage ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Typed in by people</h3>
            <span className="text-[11px] text-zinc-500">chase these</span>
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
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            No amount of chasing fixes these. A stored zero can&apos;t be told apart
            from a live we failed to capture, so read them as a best case.
          </p>

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
              {products.tagged} of {products.total} lives tagged.{" "}
              {products.tagged === 0 ? (
                <>Tag lives with the product they promoted and this page can start comparing them.</>
              ) : products.combos <= 1 ? (
                <>
                  Every tagged live promoted the same combination of products, so
                  leads can&apos;t be split between them yet.{" "}
                  <strong className="font-medium text-zinc-600 dark:text-zinc-400">
                    Tag lives with a single product from now on — after about 10
                    of those, per-product comparison becomes possible.
                  </strong>
                </>
              ) : (
                <>
                  {products.combos} different product combinations in use — enough
                  to start comparing them.
                </>
              )}
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
              <div className="mb-2 rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                A blank is not zero leads — it means nobody has typed the number in
                yet.
              </div>
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
                      {r.startedAt ? fmtDate.format(new Date(r.startedAt)) : "—"}
                      <span className="ml-1.5 font-mono font-normal text-zinc-400">
                        @{r.handle}
                      </span>
                    </Link>
                    <span className="text-[11px] text-zinc-500">
                      {r.totalViews?.toLocaleString("en-MY") ?? "—"} views ·{" "}
                      <span className="text-amber-600 dark:text-amber-400">
                        {r.missing.join(", ")} not entered
                      </span>
                      {r.filteredWithoutTotal && (
                        <span
                          className="ml-1 text-rose-600 dark:text-rose-400"
                          title="Filtered Leads was entered but Total Leads wasn't — this pairing breaks the Lead Quality figure."
                        >
                          ⚠
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
    </section>
  );
}

/** Neutral for automatic fields — nobody can act on them, so no red/green. */
function toneFor(c: Coverage): string {
  if (c.kind === "auto" || c.pct == null) return "bg-zinc-400";
  if (c.pct < 40) return "bg-rose-500";
  if (c.pct < 90) return "bg-amber-500";
  return "bg-emerald-500";
}

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
