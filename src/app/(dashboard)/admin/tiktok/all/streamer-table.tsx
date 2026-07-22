import Link from "next/link";
import { HelpTip } from "@/components/help-tip";
import { METRIC_HELP } from "@/lib/tiktok-live/metric-help";
import type { AnalysisSession } from "@/lib/tiktok-live/live-analysis-core";
import { streamerRows } from "@/lib/tiktok-live/overview-core";

const nf = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-MY");

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
  const quiet = rows.filter((r) => r.livesWithLeads === 0);

  return (
    <section className="mb-10">
      <div className="mb-1 flex items-center gap-1.5">
        <h2 id="streamers" className="scroll-mt-28 text-lg font-semibold">
          Streamers
        </h2>
        <HelpTip text={METRIC_HELP.streamerTable} label="About this table" />
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Rates, not totals — over the same dates. Not a ranking.
      </p>

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
                    {r.qualityRate == null ? "—" : `${r.qualityRate}%`}
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

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        All three lead columns rest on {leadLives} of {totalLives} lives in this
        period.
        {quiet.length > 0 && (
          <>
            {" "}
            {quiet.map((q) => `@${q.handle}`).join(", ")}{" "}
            {quiet.length === 1 ? "has" : "have"} lives with no lead numbers
            entered — that is a data-entry gap, not a result.
          </>
        )}{" "}
        With so few streamers, no statistical test is warranted and none is shown.
      </p>
      {rows.some((r) => !(keywordsByAccount.get(r.accountId) ?? false)) && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
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
