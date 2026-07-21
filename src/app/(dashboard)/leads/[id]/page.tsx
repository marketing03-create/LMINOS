import { desc, eq, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RejectLeadForm } from "./reject-form";

type LeadDetail = {
  id: string;
  brandId: string;
  brandSlug: string | null;
  loanType: string;
  fullName: string | null;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  sourcePlatform: string;
  sourceChannel: string | null;
  campaignName: string | null;
  leadStatus: string;
  priorityLevel: string;
  locationRegion: string;
  assignedAgentEmail: string | null;
  assignedTeamName: string | null;
  assignedAt: Date | null;
  firstContactedAt: Date | null;
  slaBreachedAt: Date | null;
  masterLeadId: string | null;
  submittedAt: Date;
  notes: string | null;
};

type Touchpoint = {
  id: string;
  sourcePlatform: string;
  submittedAt: Date;
};

type SaleRow = {
  id: string;
  matchConfidence: string;
  salesStatus: string | null;
  salesAmount: string | null;
  revenueValue: string | null;
  agentNameRaw: string | null;
  closedDate: string | null;
  syncedAt: Date;
};

type AuditRow = {
  id: string;
  eventType: string;
  createdAt: Date;
  after: unknown;
};

async function load(id: string): Promise<{
  lead: LeadDetail | null;
  touchpoints: Touchpoint[];
  sales: SaleRow[];
  audit: AuditRow[];
  error: string | null;
}> {
  try {
    const { db } = await import("@/db/client");
    const {
      brands,
      leads,
      leadTouchpoints,
      salesRecords,
      teams,
      users,
      auditLogs,
      campaigns,
    } = await import("@/db/schema");

    const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    if (!lead) return { lead: null, touchpoints: [], sales: [], audit: [], error: null };

    const brand = await db.query.brands.findFirst({
      where: eq(brands.id, lead.brandId),
    });
    const team = lead.assignedTeamId
      ? await db.query.teams.findFirst({
          where: eq(teams.id, lead.assignedTeamId),
        })
      : null;
    const agent = lead.assignedAgentId
      ? await db.query.users.findFirst({
          where: eq(users.id, lead.assignedAgentId),
        })
      : null;
    const campaign = lead.campaignId
      ? await db.query.campaigns.findFirst({
          where: eq(campaigns.id, lead.campaignId),
        })
      : null;

    const touchpoints = (await db
      .select({
        id: leadTouchpoints.id,
        sourcePlatform: leadTouchpoints.sourcePlatform,
        submittedAt: leadTouchpoints.submittedAt,
      })
      .from(leadTouchpoints)
      .where(eq(leadTouchpoints.leadId, lead.id))
      .orderBy(desc(leadTouchpoints.submittedAt))
      .limit(50)) as Touchpoint[];

    const sales = (await db
      .select({
        id: salesRecords.id,
        matchConfidence: salesRecords.matchConfidence,
        salesStatus: salesRecords.salesStatus,
        salesAmount: salesRecords.salesAmount,
        revenueValue: salesRecords.revenueValue,
        agentNameRaw: salesRecords.agentNameRaw,
        closedDate: salesRecords.closedDate,
        syncedAt: salesRecords.syncedAt,
      })
      .from(salesRecords)
      .where(eq(salesRecords.leadId, lead.id))
      .orderBy(desc(salesRecords.syncedAt))) as SaleRow[];

    const audit = (await db
      .select({
        id: auditLogs.id,
        eventType: auditLogs.eventType,
        createdAt: auditLogs.createdAt,
        after: auditLogs.after,
      })
      .from(auditLogs)
      .where(
        or(
          eq(auditLogs.entityId, lead.id)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(50)) as AuditRow[];

    return {
      lead: {
        id: lead.id,
        brandId: lead.brandId,
        brandSlug: brand?.slug ?? null,
        loanType: lead.loanType,
        fullName: lead.fullName,
        normalizedPhone: lead.normalizedPhone,
        normalizedEmail: lead.normalizedEmail,
        sourcePlatform: lead.sourcePlatform,
        sourceChannel: lead.sourceChannel,
        campaignName: campaign?.name ?? null,
        leadStatus: lead.leadStatus,
        priorityLevel: lead.priorityLevel,
        locationRegion: lead.locationRegion,
        assignedAgentEmail: agent?.email ?? null,
        assignedTeamName: team?.name ?? null,
        assignedAt: lead.assignedAt,
        firstContactedAt: lead.firstContactedAt,
        slaBreachedAt: lead.slaBreachedAt,
        masterLeadId: lead.masterLeadId,
        submittedAt: lead.submittedAt,
        notes: lead.notes,
      },
      touchpoints,
      sales,
      audit,
      error: null,
    };
  } catch (err) {
    return {
      lead: null,
      touchpoints: [],
      sales: [],
      audit: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { lead, touchpoints, sales, audit, error } = await load(id);

  if (!lead && !error) notFound();

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      {error && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Database unavailable. <span className="opacity-70">{error}</span>
        </div>
      )}

      {lead && (
        <>
          <header className="mb-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {lead.fullName ?? "(no name)"}
                </h1>
                <p className="mt-1 text-sm text-zinc-500 font-mono">{lead.id}</p>
              </div>
              <div className="flex gap-2">
                <StatusPill v={lead.leadStatus} />
                <PriorityPill v={lead.priorityLevel} />
              </div>
            </div>
            {lead.masterLeadId && (
              <div className="mt-3 text-sm text-amber-700 dark:text-amber-400">
                ⚠️ This is a duplicate of{" "}
                <Link
                  href={`/leads/${lead.masterLeadId}`}
                  className="underline font-mono"
                >
                  {lead.masterLeadId.slice(0, 8)}…
                </Link>
              </div>
            )}
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Card title="Contact">
              <Field label="Phone" value={lead.normalizedPhone ? <code className="font-mono">{lead.normalizedPhone}</code> : null} />
              <Field label="Email" value={lead.normalizedEmail} />
              <Field label="Region" value={lead.locationRegion} />
            </Card>
            <Card title="Loan">
              <Field label="Loan type" value={lead.loanType} />
              <Field label="Brand" value={lead.brandSlug} />
              <Field label="Submitted" value={fmt(lead.submittedAt)} />
            </Card>
            <Card title="Attribution">
              <Field label="Source" value={lead.sourcePlatform} />
              <Field label="Channel" value={lead.sourceChannel} />
              <Field label="Campaign" value={lead.campaignName} />
            </Card>
            <Card title="Assignment">
              <Field label="Agent" value={lead.assignedAgentEmail} />
              <Field label="Team" value={lead.assignedTeamName} />
              <Field label="Assigned at" value={fmt(lead.assignedAt)} />
              <Field label="First contact" value={fmt(lead.firstContactedAt)} />
              <Field
                label="SLA breached"
                value={lead.slaBreachedAt ? `⚠️ ${fmt(lead.slaBreachedAt)}` : "—"}
              />
            </Card>
          </div>

          {lead.notes && (
            <Card title="Notes">
              <pre className="text-xs whitespace-pre-wrap font-mono text-zinc-600 dark:text-zinc-400">
                {lead.notes}
              </pre>
            </Card>
          )}

          <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Touchpoints ({touchpoints.length})
          </h2>
          <Card>
            {touchpoints.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No additional touchpoints recorded.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {touchpoints.map((t) => (
                  <li key={t.id} className="flex justify-between font-mono text-xs">
                    <span>{t.sourcePlatform}</span>
                    <span className="text-zinc-500">{fmt(t.submittedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Linked sales records ({sales.length})
          </h2>
          <Card>
            {sales.length === 0 ? (
              <p className="text-sm text-zinc-500">No sales record matched yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-900 -my-2">
                {sales.map((s) => (
                  <li key={s.id} className="py-2 grid grid-cols-5 gap-3 text-sm">
                    <span>{s.salesStatus ?? "—"}</span>
                    <span className="text-xs text-zinc-500">{s.matchConfidence}</span>
                    <span className="tabular-nums">
                      {s.salesAmount ? `RM ${Number(s.salesAmount).toLocaleString()}` : "—"}
                    </span>
                    <span className="tabular-nums">
                      {s.revenueValue ? `RM ${Number(s.revenueValue).toLocaleString()}` : "—"}
                    </span>
                    <span className="text-xs text-zinc-500 text-right">
                      {s.agentNameRaw ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {lead.leadStatus !== "rejected" &&
            lead.leadStatus !== "duplicate_merged" && (
              <>
                <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                  Actions
                </h2>
                <Card>
                  <RejectLeadForm leadId={lead.id} />
                </Card>
              </>
            )}

          <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Activity ({audit.length})
          </h2>
          <Card>
            {audit.length === 0 ? (
              <p className="text-sm text-zinc-500">No audit entries.</p>
            ) : (
              <ul className="space-y-2 text-xs font-mono">
                {audit.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span>{a.eventType}</span>
                    <span className="text-zinc-500">{fmt(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-5">
      {title && (
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
          {title}
        </div>
      )}
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}
function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}
function StatusPill({ v }: { v: string }) {
  const tone =
    v === "approved" || v === "closed"
      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-300"
      : v === "rejected" || v === "not_suitable" || v === "unreachable"
        ? "bg-rose-100 dark:bg-rose-900/30 text-rose-900 dark:text-rose-300"
        : v === "duplicate_merged"
          ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-500"
          : "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {v}
    </span>
  );
}
function PriorityPill({ v }: { v: string }) {
  const tone =
    v === "vip"
      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300"
      : v === "hot"
        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-300"
        : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {v}
    </span>
  );
}
function fmt(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-MY", { hour12: false });
}
