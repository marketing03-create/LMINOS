import { desc, eq } from "drizzle-orm";
import { ManualLinkForm } from "./manual-link-form";

type Unmatched = {
  id: string;
  syncedAt: Date;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  agentNameRaw: string | null;
  loanType: string | null;
  salesStatus: string | null;
  remarks: string | null;
};

async function fetchUnmatched(): Promise<{ rows: Unmatched[]; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { salesRecords } = await import("@/db/schema");
    const rows = (await db
      .select({
        id: salesRecords.id,
        syncedAt: salesRecords.syncedAt,
        normalizedPhone: salesRecords.normalizedPhone,
        normalizedEmail: salesRecords.normalizedEmail,
        agentNameRaw: salesRecords.agentNameRaw,
        loanType: salesRecords.loanType,
        salesStatus: salesRecords.salesStatus,
        remarks: salesRecords.remarks,
      })
      .from(salesRecords)
      .where(eq(salesRecords.matchConfidence, "unmatched"))
      .orderBy(desc(salesRecords.syncedAt))
      .limit(50)) as Unmatched[];
    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function UnmatchedSalesPage() {
  const { rows, error } = await fetchUnmatched();

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Unmatched sales records
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sales rows from Google Sheets that we couldn&apos;t link to a known lead.
          Paste a lead id to link manually.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      {rows.length === 0 && !error && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-10 text-center text-zinc-500">
          🎉 Nothing in the manual-review queue.
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.id}
            className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5"
          >
            <div className="flex items-baseline justify-between mb-2">
              <div className="font-mono text-sm">
                {r.normalizedPhone ?? "(no phone)"}
              </div>
              <div className="text-xs text-zinc-500">
                {new Date(r.syncedAt).toLocaleString("en-MY", { hour12: false })}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-zinc-600 dark:text-zinc-400 mb-3">
              <Field label="Email" value={r.normalizedEmail} />
              <Field label="Agent" value={r.agentNameRaw} />
              <Field label="Loan" value={r.loanType} />
              <Field label="Status" value={r.salesStatus} />
            </div>
            {r.remarks && (
              <div className="text-xs text-zinc-500 mb-3 italic">{r.remarks}</div>
            )}
            <ManualLinkForm salesRecordId={r.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div>{value ?? "—"}</div>
    </div>
  );
}
