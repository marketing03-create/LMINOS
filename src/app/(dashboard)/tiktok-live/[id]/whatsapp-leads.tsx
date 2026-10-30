import type { LiveWa } from "@/lib/wati/leads";

/**
 * This live's WhatsApp side, from WATI: how many people messaged, how fast CS
 * answered, and the funnel from viewers to filtered leads. Renders nothing for
 * a handle not linked to a WATI account, or a live whose window closed before it
 * was connected. A live that was running when WATI was connected is marked
 * Partial: its count only starts from that moment.
 *
 * Streamers see the numbers; only admins see the people (names and phones)
 * and Total PM.
 */

const timeFmt = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function fmtMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${Math.round(m % 60)}m`;
}

function pct(n: number | null, of: number | null): string | null {
  if (n === null || !of) return null;
  return `${Math.round((n / of) * 100)}%`;
}

export function WhatsAppLeads({
  wa,
  isStreamer,
  viewers,
  commentLeads,
  totalLeads,
  filteredLeads,
}: {
  wa: LiveWa | null;
  isStreamer: boolean;
  viewers: number | null;
  commentLeads: number;
  totalLeads: number | null;
  filteredLeads: number | null;
}) {
  if (!wa || wa.tracking === "none") return null;

  // Each step's share is of the step it actually comes from. Commenting is not
  // a gate to WhatsApp (most leads message without commenting), so both are a
  // share of viewers; replies and filtered leads are a share of WhatsApp leads.
  const funnel: { label: string; value: number | null; of: number | null }[] = [
    { label: "Viewers", value: viewers, of: null },
    { label: "Commented", value: commentLeads, of: viewers },
    { label: "WhatsApp PM", value: wa.waLeads, of: viewers },
    { label: "Replied", value: wa.replied, of: wa.waLeads },
    { label: "Document Collect", value: filteredLeads, of: wa.waLeads },
  ];

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold text-zinc-900 lg:text-sm lg:font-semibold lg:uppercase lg:tracking-wider lg:text-zinc-500 dark:text-zinc-100 dark:lg:text-zinc-500">
        WhatsApp
        {wa.tracking === "partial" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium normal-case tracking-normal text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Partial
          </span>
        )}
      </h2>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="WhatsApp PM" value={String(wa.waLeads)} accent />
        {/* Total PM is admin-only. */}
        {!isStreamer && (
          <Stat label="Total PM" value={totalLeads === null ? "—" : String(totalLeads)} />
        )}
        <Stat label="Replied" value={`${wa.replied}/${wa.waLeads}`} />
        <Stat label="Median reply" value={fmtMinutes(wa.medianReplyMinutes)} />
      </dl>

      <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
        {funnel.map((step) => {
          const share = pct(step.value, step.of);
          return (
            <li
              key={step.label}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 sm:block dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950"
            >
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{step.label}</span>
              <span className="flex items-baseline gap-2 sm:mt-1">
                <span className="text-lg font-semibold tabular-nums">
                  {step.value === null ? "—" : step.value.toLocaleString("en-MY")}
                </span>
                {share && <span className="text-xs tabular-nums text-zinc-500">{share}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {!isStreamer && wa.contacts.length > 0 && (
        <details className="group mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
            <span>People ({wa.contacts.length})</span>
            <span aria-hidden="true" className="text-zinc-400 transition-transform group-open:rotate-180">
              ⌄
            </span>
          </summary>
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
            {wa.contacts.map((c) => {
              const waited = c.firstReplyAt
                ? (c.firstReplyAt.getTime() - c.firstMessageAt.getTime()) / 60_000
                : null;
              return (
                <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium">{c.name ?? "—"}</div>
                    <div className="mt-0.5 font-mono text-xs text-zinc-500">+{c.phone}</div>
                    {c.firstMessageText && (
                      <div className="mt-1 line-clamp-2 break-words text-xs text-zinc-500">
                        {c.firstMessageText}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums">
                    <div className="text-zinc-500">{timeFmt.format(c.firstMessageAt)}</div>
                    {c.firstReplyAt ? (
                      <div className="mt-0.5 text-emerald-600 dark:text-emerald-400">
                        {fmtMinutes(waited)}
                        {c.firstReplyBy ? ` · ${c.firstReplyBy}` : ""}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-amber-600 dark:text-amber-400">Waiting</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900 lg:dark:bg-zinc-950">
      <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`mt-0.5 text-xl font-semibold tabular-nums ${
          accent ? "text-indigo-600 dark:text-indigo-400" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
