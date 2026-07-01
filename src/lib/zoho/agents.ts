/**
 * Derive sales-agent user records from the "Assigned To" values already
 * synced onto leads (the authoritative assignment source — cleaner than the
 * workbook's flat `agent` tab).
 *
 * Creates one `users` row per distinct agent name (role `sales_agent`),
 * keyed by a deterministic synthetic email so re-runs are idempotent. These
 * are NOT Supabase Auth accounts — they exist only so leads/sales can link to
 * an agent for performance dashboards. If an agent later signs in via SSO,
 * their real auth row is separate (match/merge is a future concern).
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { leads, users } from "@/db/schema";
import { extractAgentName } from "./parse";

/** Deterministic synthetic email for a Zoho-sourced agent. */
export function agentEmail(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `${slug}@agent.lmiros.local`;
}

export type AgentSyncResult = {
  distinctNames: string[];
  created: number;
  existing: number;
};

export async function syncAgentsFromLeads(): Promise<AgentSyncResult> {
  // Pull every distinct raw "Assigned To" from Zoho-sourced leads.
  const rows = await db
    .select({
      assignedTo: sql<string | null>`${leads.rawPayload}->>'Assigned To'`,
    })
    .from(leads)
    .where(sql`${leads.externalRecordId} is not null`)
    .groupBy(sql`${leads.rawPayload}->>'Assigned To'`);

  const names = new Set<string>();
  for (const r of rows) {
    const name = extractAgentName(r.assignedTo);
    if (name) names.add(name);
  }

  let created = 0;
  let existing = 0;
  for (const name of names) {
    const email = agentEmail(name);
    const found = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
      columns: { id: true },
    });
    if (found) {
      existing++;
      continue;
    }
    await db.insert(users).values({
      id: randomUUID(),
      email,
      fullName: name,
      role: "sales_agent",
      isActive: true,
    });
    created++;
  }

  return {
    distinctNames: [...names].sort(),
    created,
    existing,
  };
}
