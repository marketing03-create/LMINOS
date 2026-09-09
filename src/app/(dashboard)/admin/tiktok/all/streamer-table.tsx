import Link from "next/link";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import type { AnalysisSession } from "@/lib/tiktok-live/live-analysis-core";
import { streamerRows } from "@/lib/tiktok-live/overview-core";
import { MobileTable } from "@/components/mobile/mobile-table";
import { NotEntered } from "@/components/mobile/not-entered";
import { StreamerCardList } from "./streamer-card-list";

/**
 * `text-current` so the glyph inherits its cell exactly as the bare string it
 * replaces did — a `dim` cell stays zinc-400, an ordinary one stays body ink.
 * The only thing that changes is that a screen reader now hears "Not entered"
 * where it used to hear "em dash", or nothing at all.
 */
const dash = <NotEntered variant="dash" className="text-current" />;

const nf = (n: number | null): React.ReactNode =>
  n == null ? dash : n.toLocaleString("en-MY");

/**
 * Streamers side by side. A TABLE, not a grouped bar chart — with two handles a
 * chart burns 240px to say what two rows say precisely, and a bar cannot render
 * "never recorded", which is exactly the state one handle is in.
 *
 * The rules that matter here are ethical as much as statistical: this is the one
 * place where a data-entry gap becomes a public number beside a named person. So
 * an unrecorded figure renders "—" with a reason, never 0; rows are ordered by
 * lives (neutral, descriptive) and never ranked by a lead column; and every rate
 * is pooled per handle so streaming more often can't flatter anyone.
 *
 * Below `lg` those same rules survive in a different shape. The grid is
 * `min-w-[52rem]` with a sticky Handle column, which on a 375px phone leaves
 * about 230px for eleven scrolling columns — so `MobileTable` hands a thumb
 * `StreamerCardList` instead: one metric across all handles, switched by three
 * chips, with the full row a tap down. `streamerRows()` runs once, here, and
 * both renderings read the same array.
 */
export function StreamerTable({
  sessions,
  keywordsByAccount,
}: {
  sessions: AnalysisSession[];
  /** accountId → whether that handle has lead keywords configured. */
  keywordsByAccount: Map<string, boolean>;
}) {
  const rows = streamerRows(sessions);
  if (rows.length === 0) return null;

  const totalLives = sessions.length;
  const leadLives = sessions.filter((s) => s.totalLeads != null).length;
  const anyMissingKeywords = rows.some(
    (r) => !(keywordsByAccount.get(r.accountId) ?? false)
  );

  // A Map is awkward to hand across the client boundary and the card list only
  // ever reads it by key, so it goes over as a plain object.
  const keywords: Record<string, boolean> = {};
  for (const r of rows) keywords[r.accountId] = keywordsByAccount.get(r.accountId) ?? false;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-1.5">
        <h2 id="streamers" className="scroll-mt-28 text-lg font-semibold">
          Streamers
        </h2>
        <HelpTip text={METRIC_HELP.streamerTable} label="About this table" />
      </div>

      <MobileTable
        table={
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <Th className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/50">
                    Handle
                  </Th>
                  <Th right>Lives</Th>
                  <Th right>Live hrs</Th>
                  <Th right>Views / hr</Th>
                  <Th right>Median peak</Th>
                  <Th right>Comments / 1k views</Th>
                  <Th right>Followers / hr</Th>
                  <Th>Lead data</Th>
                  <Th right>Total Leads</Th>
                  <Th right>Leads / hr</Th>
                  <Th right>Quality</Th>
                  <Th>Keyword capture</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const noLeads = r.livesWithLeads === 0;
                  const hasKeywords = keywordsByAccount.get(r.accountId) ?? false;
                  return (
                    <tr
                      key={r.accountId}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                    >
                      <Td className="sticky left-0 z-10 bg-white font-mono dark:bg-zinc-950">
                        <Link
                          href={`/admin/tiktok/${r.accountId}`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          @{r.handle}
                        </Link>
                      </Td>
                      <Td right>{r.lives}</Td>
                      <Td right>{r.liveHours}h</Td>
                      <Td right>{nf(r.viewsPerHour)}</Td>
                      <Td right>{nf(r.medianPeak)}</Td>
                      <Td right>{nf(r.commentsPer1kViews)}</Td>
                      <Td right>{nf(r.followersPerHour)}</Td>
                      <Td>
                        {noLeads ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            0 of {r.lives} — not recorded
                          </span>
                        ) : (
                          <span className="text-zinc-500">
                            {r.livesWithLeads} of {r.lives} keyed in
                          </span>
                        )}
                      </Td>
                      <Td right dim={noLeads}>
                        {nf(r.totalLeads)}
                      </Td>
                      <Td right dim={noLeads}>
                        {nf(r.leadsPerHour)}
                      </Td>
                      <Td right dim={r.qualityRate == null}>
                        {r.qualityRate == null ? dash : `${r.qualityRate}%`}
                      </Td>
                      <Td>
                        {hasKeywords ? (
                          <span className="text-zinc-500">set up</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">
                            not set up
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        }
        cards={<StreamerCardList rows={rows} keywords={keywords} />}
      />

      {/* The one footnote that survives is a denominator: it says how much of
          the period the three lead columns actually rest on, which is the only
          thing standing between "@kai got 40 leads" and a verdict. It is
          written twice on purpose — desktop keeps today's 11px line untouched
          (P5), and below `lg` the same sentence renders at 14px, because a
          caveat may never be set smaller than the number it qualifies.

          What went with the old version: the "@x has lives with no lead numbers
          entered — that is a data-entry gap, not a result" clause, now said in
          ink by the amber "0 of N — not recorded" cell beside every affected
          handle and by "Not entered" on the cards; and "With so few streamers,
          no statistical test is warranted and none is shown", which renders
          identically against an empty database and so is not information. */}
      <p className="mt-2 hidden text-[11px] leading-relaxed text-zinc-500 lg:block">
        All three lead columns rest on {leadLives} of {totalLives} lives in this
        period.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-500 lg:hidden dark:text-zinc-400">
        All three lead columns rest on {leadLives} of {totalLives} lives in this
        period.
      </p>

      {/* Desktop only, and not an oversight: below `lg` every card carries
          "Keyword capture — not set up" with this consequence spelled out on
          its own line, so a standing paragraph repeating it would be the
          duplication this redesign exists to remove. The table has nowhere to
          put it, so the table keeps the paragraph. */}
      {anyMissingKeywords && (
        <p className="mt-1.5 hidden text-[11px] leading-relaxed text-amber-700 lg:block dark:text-amber-400">
          A handle marked “not set up” has no chat keywords configured, so its
          keyword count will read zero however many viewers comment. Set its
          keywords on the handle&apos;s admin page to the words your viewers
          actually type.
        </p>
      )}
    </section>
  );
}

function Th({
  children,
  right,
  className = "",
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 font-semibold ${
        right ? "text-right" : ""
      } ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  dim,
  className = "",
}: {
  children: React.ReactNode;
  right?: boolean;
  dim?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 tabular-nums ${
        right ? "text-right" : ""
      } ${dim ? "text-zinc-400 dark:text-zinc-600" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
