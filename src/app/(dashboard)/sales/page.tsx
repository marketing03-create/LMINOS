import { desc } from "drizzle-orm";
import Link from "next/link";

type Row = {
  id: string;
  leadId: string | null;
  normalizedPhone: string | null;
  agentNameRaw: string | null;
  loanType: string | null;
  salesStatus: string | null;
  salesAmount: string | null;
  revenueValue: string | null;
  matchConfidence: string;
  syncedAt: Date;
};

async function fetchRows(): Promise<{ rows: Row[]; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { salesRecords } = await import("@/db/schema");
    const rows = (await db
      .select({
        id: salesRecords.id,
        leadId: salesRecords.leadId,
        normalizedPhone: salesRecords.normalizedPhone,
        agentNameRaw: salesRecords.agentNameRaw,
        loanType: salesRecords.loanType,
        salesStatus: salesRecords.salesStatus,
        salesAmount: salesRecords.salesAmount,
        revenueValue: salesRecords.revenueValue,
        matchConfidence: salesRecords.matchConfidence,
        syncedAt: salesRecords.syncedAt,
      })
      .from(salesRecords)
      .orderBy(desc(salesRecords.syncedAt))
      .limit(100)) as Row[];
    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function SalesPage() {
  const { rows, error } = await fetchRows();

  const unmatched = rows.filter((r) => r.matchConfidence === "unmatched").length;

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales records</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Synced from Google Sheets (most recent 100).
          </p>
        </div>
        {unmatched > 0 && (
          <Link
            href="/sales/unmatched"
            className="text-sm rounded-md px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300 hover:bg-amber-200"
          >
            {unmatched} unmatched · review
          </Link>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
            <tr>
              <Th>Synced</Th>
              <Th>Phone</Th>
              <Th>Agent</Th>
              <Th>Loan</Th>
              <Th>Status</Th>
              <Th>Amount</Th>
              <Th>Revenue</Th>
              <Th>Match</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                  No sales records yet. Sheets sync runs every 2 minutes.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <Td className="text-zinc-500 tabular-nums">
                  {new Date(r.syncedAt).toLocaleString("en-MY", { hour12: false })}
                </Td>
                <Td className="font-mono text-xs">{r.normalizedPhone ?? "—"}</Td>
                <Td>{r.agentNameRaw ?? "—"}</Td>
                <Td>{r.loanType ?? "—"}</Td>
                <Td>{r.salesStatus ?? "—"}</Td>
                <Td className="tabular-nums">
                  {r.salesAmount ? `RM ${Number(r.salesAmount).toLocaleString()}` : "—"}
                </Td>
                <Td className="tabular-nums">
                  {r.revenueValue ? `RM ${Number(r.revenueValue).toLocaleString()}` : "—"}
                </Td>
                <Td>
                  <MatchPill v={r.matchConfidence} />{" "}
                  {r.leadId && (
                    <Link
                      href={`/leads/${r.leadId}`}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      view lead
                    </Link>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{children}</th>;
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
function MatchPill({ v }: { v: string }) {
  const color =
    v === "exact_phone" || v === "exact_email"
      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-300"
      : v === "fuzzy" || v === "manual"
        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300"
        : "bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${color}`}>
      {v}
    </span>
  );
}
