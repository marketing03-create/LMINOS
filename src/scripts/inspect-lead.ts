/**
 * Pretty-print the most recent lead with its routing + audit trail.
 * Run: npm run dev:inspect
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assignmentsHistory,
  auditLogs,
  brands,
  leads,
  teams,
  users,
} from "@/db/schema";

async function main() {
  const lead = await db
    .select()
    .from(leads)
    .orderBy(desc(leads.submittedAt))
    .limit(1)
    .then((r) => r[0]);

  if (!lead) {
    console.log("No leads in DB.");
    process.exit(0);
  }

  const brand = await db.query.brands.findFirst({
    where: eq(brands.id, lead.brandId),
  });
  const team = lead.assignedTeamId
    ? await db.query.teams.findFirst({ where: eq(teams.id, lead.assignedTeamId) })
    : null;
  const agent = lead.assignedAgentId
    ? await db.query.users.findFirst({ where: eq(users.id, lead.assignedAgentId) })
    : null;
  const history = await db
    .select()
    .from(assignmentsHistory)
    .where(eq(assignmentsHistory.leadId, lead.id));
  const audit = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityId, lead.id))
    .orderBy(desc(auditLogs.createdAt));

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`LEAD ${lead.id}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  name:       ${lead.fullName}`);
  console.log(`  phone:      ${lead.normalizedPhone}  (raw: ${lead.phoneNumberRaw})`);
  console.log(`  email:      ${lead.normalizedEmail}`);
  console.log(`  loan_type:  ${lead.loanType}`);
  console.log(`  brand:      ${brand?.slug} (${brand?.name})`);
  console.log(`  source:     ${lead.sourcePlatform} / ${lead.sourceChannel}`);
  console.log(`  region:     ${lead.locationRegion}`);
  console.log(`  status:     ${lead.leadStatus}`);
  console.log(`  priority:   ${lead.priorityLevel}`);
  console.log(`  submitted:  ${lead.submittedAt.toISOString()}`);
  console.log(`  assigned_at:${lead.assignedAt?.toISOString() ?? "—"}`);
  console.log(`  team:       ${team?.name ?? "—"}`);
  console.log(`  agent:      ${agent?.email ?? "—"} (${agent?.fullName ?? "—"})`);
  console.log("");
  console.log(`  Assignment history (${history.length}):`);
  for (const h of history) {
    console.log(
      `    ${h.createdAt.toISOString()}  ${h.fromAgentId ?? "—"} → ${h.toAgentId ?? "—"}  [${h.reason}]`
    );
  }
  console.log("");
  console.log(`  Audit (${audit.length}):`);
  for (const a of audit) {
    console.log(`    ${a.createdAt.toISOString()}  ${a.eventType}`);
  }
  console.log("");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
