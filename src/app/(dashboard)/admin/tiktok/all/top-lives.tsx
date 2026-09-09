import Link from "next/link";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import type { AnalysisSession } from "@/lib/tiktok-live/live-analysis-core";
import { topLives, type RankedLive } from "@/lib/tiktok-live/overview-core";
import { PaneSwitcher } from "@/components/mobile/pane-switcher";
import { RecordCard, RecordList } from "@/components/mobile/record-card";
import { Disclosure } from "@/components/mobile/disclosure";
import { NotEntered } from "@/components/mobile/not-entered";

const fmtDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Inherits the cell it lands in, so the desktop rows keep today's exact ink. */
const dash = <NotEntered variant="dash" className="text-current" />;

/**
 * The two handfuls of lives worth actually rewatching.
 *
 * Ranked on views per live hour because that is ~100% recorded and therefore
 * works for every handle — ranking on leads would silently rank on whose
 * customer-service team fills forms in, and ranking on keyword comments would
 * rank on whose keywords happen to be configured.
 *
 * Below `lg` the two `min-w-[34rem]` tables become two card lists behind a
 * segmented control, because side by side they are 68rem of grid on a 375px
 * screen and stacked they are twelve 30px rows an admin has to aim at. Only one
 * list can be the answer to "which live do I rewatch", so only one is on screen.
 *
 * `PaneSwitcher` renders its panes as `lg:contents` at 1024px and drops its own
 * chip strip entirely, so the desktop grid still lays out the two panels as its
 * own direct children — same two boxes, same equal-height stretch, same order.
 */
export function TopLives({ sessions }: { sessions: AnalysisSession[] }) {
  const { best, weakest } = topLives(sessions);
  if (best.length === 0) return null;

  return (
    <section className="mb-10">
      {/* The paragraph that used to sit here ("By views per hour streamed. Lives
          under 30 minutes are excluded…") is word for word what the `?` beside
          the heading already says, so it was two sentences of standing pixels
          restating the control next to them. */}
      <div className="mb-3 flex items-center gap-1.5">
        <h2 id="lives" className="scroll-mt-28 text-lg font-semibold">
          Best &amp; weakest lives
        </h2>
        <HelpTip text={METRIC_HELP.topLives} label="About this list" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PaneSwitcher
          defaultPaneId="best"
          panes={[
            {
              id: "best",
              label: "Strongest",
              children: <Panel title="Strongest response" rows={best} tone="emerald" />,
            },
            {
              id: "weakest",
              label: "Lowest",
              children:
                weakest.length > 0 ? (
                  <Panel
                    title="Lowest response — worth rewatching"
                    rows={weakest}
                    tone="zinc"
                  />
                ) : (
                  <div className="grid place-items-center rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm leading-relaxed text-zinc-500 dark:border-zinc-700">
                    Not enough lives in this period to separate a weakest group
                    without repeating the ones above.
                  </div>
                ),
            },
          ]}
        />
      </div>
    </section>
  );
}

/**
 * One panel, in both renderings, as two siblings rather than through
 * `MobileTable`.
 *
 * `MobileTable` would wrap the desktop panel in a plain `hidden lg:block` div,
 * and at `lg` that div — not the bordered panel — becomes the grid item. The
 * panel inside it would then size to its own content instead of stretching, so
 * the two boxes would stop matching heights, which is visible on the managers'
 * daily page the moment one list is shorter than the other. Emitting the same
 * two classes by hand keeps the bordered panel as the grid item it is today.
 * There is no "show the full grid" escape here either: six columns is a
 * readable card, and the escape exists for the 12- and 22-column monsters.
 */
function Panel({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: RankedLive[];
  tone: "emerald" | "zinc";
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 lg:block dark:border-zinc-800">
        <div
          className={`border-b px-3 py-2 text-xs font-semibold ${
            tone === "emerald"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300"
          }`}
        >
          {title}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800">
                <th className="px-3 py-1.5 font-semibold">When</th>
                <th className="px-3 py-1.5 font-semibold">Handle</th>
                <th className="px-3 py-1.5 text-right font-semibold">Mins</th>
                <th className="px-3 py-1.5 text-right font-semibold">Views</th>
                <th className="px-3 py-1.5 text-right font-semibold">Views / hr</th>
                <th className="px-3 py-1.5 text-right font-semibold">Leads</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <Link
                      href={`/tiktok-live/${l.id}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {l.startedAt ? fmtDate.format(new Date(l.startedAt)) : dash}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-zinc-500">
                    @{l.handle}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {l.durationMinutes}
                  </td>
                  {/* The raw view count sits beside the rate on purpose, so a
                      31-minute live can't top the list on a rate alone. */}
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">
                    {l.totalViews?.toLocaleString("en-MY") ?? dash}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {l.viewsPerHour.toLocaleString("en-MY")}
                  </td>
                  {/* The `title="Not entered — not zero"` that used to hang off
                      this cell is gone: a native tooltip has no touch
                      equivalent, so on a phone the one honest annotation on the
                      column was unreachable. The dash now carries the same words
                      as an accessible name, and below `lg` the card prints them
                      in full. */}
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums ${
                      l.totalLeads == null ? "text-zinc-400 dark:text-zinc-600" : ""
                    }`}
                  >
                    {l.totalLeads?.toLocaleString("en-MY") ?? dash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lg:hidden">
        <LiveCards rows={rows} />
      </div>
    </>
  );
}

/**
 * Three cards, then the rest behind a disclosure. Three is what fits above the
 * fold beside the chips, and this section answers "which one do I rewatch
 * first" — the fourth and fifth entries are reference, not the answer.
 *
 * The whole card is the drill-in. Today the only way into a live from here is a
 * 30px "When" link in a 30px row, which is the smallest tap target on the page
 * and the one an admin uses most from this section.
 */
function LiveCards({ rows }: { rows: RankedLive[] }) {
  const shown = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <RecordList legend="Not entered means nobody has keyed the leads in yet — it is not a zero.">
      {shown.map((l) => (
        <LiveCard key={l.id} live={l} />
      ))}
      {rest.length > 0 && (
        <Disclosure title={`Show all ${rows.length}`}>
          <div className="space-y-3">
            {rest.map((l) => (
              <LiveCard key={l.id} live={l} />
            ))}
          </div>
        </Disclosure>
      )}
    </RecordList>
  );
}

function LiveCard({ live: l }: { live: RankedLive }) {
  return (
    <RecordCard
      href={`/tiktok-live/${l.id}`}
      title={l.startedAt ? fmtDate.format(new Date(l.startedAt)) : "Time not recorded"}
      meta={
        <>
          <span className="font-mono">@{l.handle}</span>
          {` · ${l.durationMinutes} min`}
        </>
      }
      primary={[
        { label: "Views / hr", value: l.viewsPerHour },
        { label: "Views", value: l.totalViews },
        { label: "Leads", value: l.totalLeads },
      ]}
    />
  );
}
