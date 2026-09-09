import Link from "next/link";
import type { RangeChoice } from "@/lib/date-range";
import type { SessionRow } from "@/lib/tiktok-live/queries";
import { CompactDateFilter } from "@/components/compact-date-filter";
import { ProductBadges } from "@/components/product-badges";
import { Disclosure } from "@/components/mobile/disclosure";
import { HelpChip } from "@/components/mobile/metric-help-sheet";
import { type MetricItem, MetricGrid } from "@/components/mobile/metric-line";
import { RecordCard, RecordList } from "@/components/mobile/record-card";
import { METRIC_LABEL, missingMetrics } from "@/lib/tiktok-live/completeness";
import { LeadsQuickAction } from "./leads-quick-action";

/**
 * The streamer's Home. It used to be a stats feed: an insights strip, an amber
 * banner counting the lives that still owed leads, then every live in the
 * period as an identical card carrying five 10px numbers and a remarks box.
 * Everything on it was true; none of it was a next action. The streamer's
 * actual job here takes about ten seconds a day — "which of my lives still
 * needs numbers from me?" — and the old layout made her derive that answer by
 * scanning dashes across twenty cards.
 *
 * So this is a to-do list now. The count at the top IS the question, the cards
 * under "Needs numbers" are the answer, and each one names the fields it is
 * waiting on rather than showing a generic chip. That last part is the whole
 * move: "Add results" tells you a card wants something; "Missing: Total Leads,
 * DMs" tells you what to go and find, which is the difference between browsing
 * and working. The lives that are done collapse into one line, because a
 * finished live is a fact you occasionally want to check, not a thing to read
 * twenty of.
 *
 * "Needs numbers" is `missingMetrics()` from `completeness.ts` — the same pure
 * function the reminder jobs and the notification inbox use. That is deliberate
 * and worth keeping: the reminder that pings her at 10pm and the screen she
 * opens afterwards can now never disagree about what "incomplete" means. It
 * reads four nullable fields the row already carries, so nothing here costs a
 * query.
 */

/** MYT, and only MYT — a live's clock time is the streamer's own local time. */
const whenFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
/**
 * A missing start time used to print "—". As a card *title* that is worse than
 * useless: it is the only thing distinguishing one card from the next, and a
 * bare dash where a date belongs reads as a rendering bug rather than as
 * missing data. Words, per P1.
 */
const fmtWhen = (d: Date | null) => (d ? whenFmt.format(d) : "Time not recorded");
const nf = (n: number) => n.toLocaleString("en-MY");

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function StreamerHomeFeed({
  sessions,
  choice,
}: {
  sessions: SessionRow[];
  choice: RangeChoice;
}) {
  // Contract 19 — today's arithmetic, unchanged, down to which rows count
  // toward the average. `missing` survives as the denominator on Total leads
  // (below) rather than as a second amber sentence.
  const lives = sessions.length;
  const withLeads = sessions.filter((s) => s.totalLeads != null);
  const totalLeads = withLeads.reduce((a, s) => a + (s.totalLeads ?? 0), 0);
  const avg = withLeads.length ? Math.round(totalLeads / withLeads.length) : null;

  /**
   * With a 7-day default range, "you have no lives" and "you are looking at the
   * wrong week" produce the identical empty screen, and the streamer cannot
   * tell which without being told the period and handed both exits. So this
   * state carries MORE than the one it replaces, not less: the range it found
   * nothing in, the control that changes it, and the way to add a live the
   * Fly.io connector never captured — which was previously reachable only by
   * guessing that the blue + hid it.
   */
  if (lives === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-10 text-center dark:border-zinc-700">
        <p className="text-base font-medium">No lives in {choice.label}.</p>

        {/* The period control itself, not a button that would have to open it:
            it already reads as "the range, tap to change", and one date control
            per screen means there is never a second one to disagree with. */}
        <div className="mt-5 flex justify-center">
          <CompactDateFilter basePath="/tiktok-live" choice={choice} align="start" />
        </div>

        <Link
          href="/tiktok-live/import"
          className="mx-auto mt-4 flex h-12 w-full max-w-xs items-center justify-center rounded-xl border border-zinc-300 text-base font-medium active:bg-zinc-100 dark:border-zinc-700 dark:active:bg-zinc-800"
        >
          Add a live that&rsquo;s missing &rarr;
        </Link>
      </div>
    );
  }

  // One pass, two buckets. Order is inherited from the query (newest first), so
  // both lists stay in the order the streamer thinks in.
  const needs: SessionRow[] = [];
  const done: SessionRow[] = [];
  for (const s of sessions) {
    (missingMetrics(s).length > 0 ? needs : done).push(s);
  }

  const summary: MetricItem[] = [
    { label: "Lives", value: nf(lives) },
    {
      label: "Total leads",
      value: nf(totalLeads),
      tone: "accent",
      // The old screen said this in an amber banner ("4 lives still need
      // leads"). Welded to the number it qualifies, it cannot be read as a
      // total over all of them — which is the misreading the banner existed to
      // prevent and, at 11px, mostly failed to.
      denominator: `from ${nf(withLeads.length)} of ${nf(lives)} ${plural(lives, "live", "lives")}`,
    },
    { label: "Avg per live", value: avg == null ? null : nf(avg) },
  ];

  return (
    <div className="space-y-4">
      {/* The hero count is the screen's whole thesis, so it gets the one large
          number this route is allowed — 24px on a phone, the full 28px from
          `lg` up where there is room beside the date control.

          Two things this header deliberately does NOT do any more. It does not
          restate the range under the title: the date chip three centimetres
          away already reads "7 days", and a caption that only ever repeats the
          control beside it is not information. And it does not right-align the
          control on a phone: at 375px the title fills the row, so `ml-auto`
          left the chip stranded on its own line against the right margin,
          aligned to nothing. Stacked and flush left, the title and the control
          share an edge. The desktop row is unchanged. */}
      <header className="mb-2 lg:flex lg:flex-wrap lg:items-start lg:gap-3">
        <div className="min-w-0">
          <h1
            className={`text-2xl font-semibold leading-tight tabular-nums lg:text-[28px] ${
              needs.length === 0 ? "text-emerald-600 dark:text-emerald-400" : ""
            }`}
          >
            {needs.length === 0
              ? "All caught up"
              : `${nf(needs.length)} ${plural(needs.length, "live needs", "lives need")} numbers`}
          </h1>
        </div>
        <div className="mt-3 lg:ml-auto lg:mt-0 lg:shrink-0">
          <CompactDateFilter basePath="/tiktok-live" choice={choice} />
        </div>
      </header>

      {/* Collapsed, and above the to-do list on purpose: the totals are what
          she checks weekly, the cards are what she clears daily, and the one
          she opens least should not be the one she scrolls past most. */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Disclosure title="Period summary" headingLevel={2}>
          {/* The single help affordance on this screen. It replaces 103 of the
              104 sixteen-pixel "?" buttons this feed used to carry, five of
              them nested inside every card's tap target. */}
          <div className="mb-1">
            <HelpChip keys={["totalLeads", "filteredLeads", "views"]} />
          </div>
          <MetricGrid items={summary} />
        </Disclosure>
      </div>

      {needs.length > 0 && (
        <section aria-labelledby="lm-needs-numbers">
          <h2
            id="lm-needs-numbers"
            className="mb-2 px-1 text-[17px] font-semibold text-amber-700 dark:text-amber-400"
          >
            Needs numbers
          </h2>
          <RecordList>
            {needs.map((s) => {
              const when = fmtWhen(s.startedAt);
              return (
                <RecordCard
                  key={s.id}
                  /* The post-save redirect lands on `#session-<id>`, and until
                     now nothing on a streamer's screen carried that id — the
                     "here are your updated numbers" flash has never once fired
                     for the people it was built for (contracts 81, 82). */
                  id={`session-${s.id}`}
                  href={`/tiktok-live/${s.id}`}
                  tone="warn"
                  title={when}
                  meta={`Missing: ${missingMetrics(s)
                    .map((m) => METRIC_LABEL[m])
                    .join(", ")}`}
                  badges={
                    s.products && s.products.length > 0 ? (
                      <ProductBadges products={s.products} />
                    ) : undefined
                  }
                  /* Two of the four missing fields are almost always the two
                     leads, and they are the two no screenshot can ever supply.
                     The sheet saves them over the same PATCH the session page
                     uses, without leaving Home — the card still navigates for
                     everything else. */
                  action={
                    <LeadsQuickAction
                      sessionId={s.id}
                      when={when}
                      totalLeads={s.totalLeads}
                      filteredLeads={s.filteredLeads}
                    />
                  }
                />
              );
            })}
          </RecordList>
        </section>
      )}

      {done.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <Disclosure
            title={`${nf(done.length)} ${plural(done.length, "live", "lives")} complete`}
            headingLevel={2}
          >
            <RecordList>
              {done.map((s) => (
                <RecordCard
                  key={s.id}
                  id={`session-${s.id}`}
                  href={`/tiktok-live/${s.id}`}
                  tone="good"
                  title={fmtWhen(s.startedAt)}
                  badges={
                    s.products && s.products.length > 0 ? (
                      <ProductBadges products={s.products} />
                    ) : undefined
                  }
                  /* Three numbers, not five. Duration and DMs were on the old
                     card because they fit in a five-column grid, not because
                     anyone read them here; what a finished live is checked for
                     is reach and the two lead figures. */
                  primary={[
                    { label: "Views", value: nf(s.totalViews) },
                    {
                      label: "Total leads",
                      value: s.totalLeads == null ? null : nf(s.totalLeads),
                      tone: "accent",
                    },
                    {
                      label: "Filtered leads",
                      value: s.filteredLeads == null ? null : nf(s.filteredLeads),
                    },
                  ]}
                />
              ))}
            </RecordList>
          </Disclosure>
        </div>
      )}
    </div>
  );
}
