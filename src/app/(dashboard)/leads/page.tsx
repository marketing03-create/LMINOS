import { desc } from "drizzle-orm";
import Link from "next/link";

const BYPASS = process.env.LMIROS_DEV_BYPASS_AUTH === "true";

type LeadRow = {
  id: string;
  fullName: string | null;
  normalizedPhone: string | null;
  loanType: string;
  sourcePlatform: string;
  leadStatus: string;
  priorityLevel: string;
  locationRegion: string;
  submittedAt: Date;
};

async function fetchLeads(): Promise<{
  rows: LeadRow[];
  error: string | null;
}> {
  // Lazy-import so a missing DATABASE_URL in stub mode doesn't crash module load.
  try {
    const { db } = await import("@/db/client");
    const { leads } = await import("@/db/schema");
    const rows = (await db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        normalizedPhone: leads.normalizedPhone,
        loanType: leads.loanType,
        sourcePlatform: leads.sourcePlatform,
        leadStatus: leads.leadStatus,
        priorityLevel: leads.priorityLevel,
        locationRegion: leads.locationRegion,
        submittedAt: leads.submittedAt,
      })
      .from(leads)
      .orderBy(desc(leads.submittedAt))
      .limit(100)) as LeadRow[];
    return { rows, error: null };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function LeadsPage() {
  const { rows, error } = await fetchLeads();

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Most recent 100 leads, newest first.
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <strong>Database unavailable.</strong>{" "}
          {BYPASS
            ? "Configure a real Supabase Postgres in .env.local and remove LMIROS_DEV_BYPASS_AUTH to see real data."
            : "Check DATABASE_URL."}
          <div className="mt-1 text-xs opacity-70 font-mono">{error}</div>
        </div>
      )}

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500">
            <tr className="text-left">
              <Th>Submitted</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Loan</Th>
              <Th>Source</Th>
              <Th>Region</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-zinc-500"
                >
                  No leads yet. POST to{" "}
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-900 px-1 py-0.5 rounded">
                    /api/ingest/website
                  </code>{" "}
                  to ingest one.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <Td className="text-zinc-500 tabular-nums">
                  {new Date(r.submittedAt).toLocaleString("en-MY", {
                    hour12: false,
                  })}
                </Td>
                <Td>
                  <Link
                    href={`/leads/${r.id}`}
                    className="text-zinc-900 dark:text-zinc-100 hover:underline"
                  >
                    {r.fullName ?? "—"}
                  </Link>
                </Td>
                <Td className="font-mono text-xs">
                  {r.normalizedPhone ?? "—"}
                </Td>
                <Td>{r.loanType}</Td>
                <Td>{r.sourcePlatform}</Td>
                <Td>{r.locationRegion}</Td>
                <Td>
                  <Pill v={r.priorityLevel} />
                </Td>
                <Td>
                  <Pill v={r.leadStatus} />
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
function Pill({ v }: { v: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 text-xs">
      {v}
    </span>
  );
}
