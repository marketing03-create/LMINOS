import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecycleForm } from "./recycle-form";

type Detail = {
  id: string;
  leadId: string;
  rejectedAt: Date;
  rejectionReason: string;
  recycleEligible: boolean;
  resaleEligible: boolean;
  nextAction: string;
  recycledAt: Date | null;
  recycledToLeadId: string | null;
  snapshotLoanType: string | null;
  snapshotLocationRegion: string | null;
  snapshotSourcePlatform: string | null;
  snapshotCampaignId: string | null;
  notes: string | null;
  originalLeadFullName: string | null;
  originalLeadPhone: string | null;
};

async function load(id: string): Promise<{ detail: Detail | null; error: string | null }> {
  try {
    const { db } = await import("@/db/client");
    const { rejectedLeads, leads } = await import("@/db/schema");
    const row = await db.query.rejectedLeads.findFirst({
      where: eq(rejectedLeads.id, id),
    });
    if (!row) return { detail: null, error: null };
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, row.leadId),
    });
    return {
      detail: {
        id: row.id,
        leadId: row.leadId,
        rejectedAt: row.rejectedAt,
        rejectionReason: row.rejectionReason,
        recycleEligible: row.recycleEligible,
        resaleEligible: row.resaleEligible,
        nextAction: row.nextAction,
        recycledAt: row.recycledAt,
        recycledToLeadId: row.recycledToLeadId,
        snapshotLoanType: row.snapshotLoanType,
        snapshotLocationRegion: row.snapshotLocationRegion,
        snapshotSourcePlatform: row.snapshotSourcePlatform,
        snapshotCampaignId: row.snapshotCampaignId,
        notes: row.notes,
        originalLeadFullName: lead?.fullName ?? null,
        originalLeadPhone: lead?.normalizedPhone ?? null,
      },
      error: null,
    };
  } catch (err) {
    return { detail: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function RejectedDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { detail, error } = await load(id);
  if (!detail && !error) notFound();

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <header className="mb-6">
        <Link href="/rejected" className="text-sm text-zinc-500 hover:underline">
          ← Rejected pool
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Rejected lead
        </h1>
        <p className="mt-1 text-sm text-zinc-500 font-mono">{detail?.id}</p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </div>
      )}

      {detail && (
        <>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5 space-y-2 text-sm mb-6">
            <Field label="Original lead">
              <Link
                href={`/leads/${detail.leadId}`}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {detail.originalLeadFullName ?? "(no name)"} ·{" "}
                <span className="font-mono">
                  {detail.originalLeadPhone ?? "—"}
                </span>
              </Link>
            </Field>
            <Field label="Rejected at" value={new Date(detail.rejectedAt).toLocaleString("en-MY", { hour12: false })} />
            <Field label="Reason" value={detail.rejectionReason} />
            <Field label="Next action" value={detail.nextAction} />
            <Field
              label="Recycle eligible"
              value={detail.recycleEligible ? "yes" : "no"}
            />
            <Field
              label="Resale eligible"
              value={detail.resaleEligible ? "yes" : "no"}
            />
            {detail.recycledAt && (
              <Field
                label="Recycled"
                value={
                  <>
                    {new Date(detail.recycledAt).toLocaleString("en-MY", { hour12: false })}
                    {detail.recycledToLeadId && (
                      <>
                        {" → "}
                        <Link
                          href={`/leads/${detail.recycledToLeadId}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs"
                        >
                          {detail.recycledToLeadId.slice(0, 8)}…
                        </Link>
                      </>
                    )}
                  </>
                }
              />
            )}
            {detail.notes && (
              <Field label="Notes" value={detail.notes} />
            )}
          </div>

          {detail.recycleEligible && !detail.recycledAt && (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
                Recycle
              </div>
              <RecycleForm rejectedId={detail.id} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right">{children ?? value ?? "—"}</span>
    </div>
  );
}
