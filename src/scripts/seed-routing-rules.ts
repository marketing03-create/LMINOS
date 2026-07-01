/**
 * Seed the 7 default routing rules from the plan, plus one team per rule.
 *
 * Run: npm run seed:routing
 *
 * Real team/agent mapping is loaded later via the admin UI (Week 8).
 * For Phase 1 we just need rows that wire up the end-to-end flow.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { routingRules, teams } from "@/db/schema";

const TEAM_DEFS: Array<{
  slug: string;
  name: string;
  loanTypes: ("personal" | "bank" | "angkasa" | "car" | "sme")[];
}> = [
  { slug: "senior_agents", name: "Senior agents (VIP)", loanTypes: [] },
  {
    slug: "angkasa_specialist",
    name: "Angkasa specialist",
    loanTypes: ["angkasa"],
  },
  { slug: "sme", name: "SME loan team", loanTypes: ["sme"] },
  { slug: "car", name: "Car loan team", loanTypes: ["car"] },
  {
    slug: "personal_loan_a",
    name: "Personal loan A",
    loanTypes: ["personal"],
  },
  {
    slug: "personal_loan_b",
    name: "Personal loan B (catch-all)",
    loanTypes: ["personal"],
  },
  { slug: "general_intake", name: "General intake", loanTypes: [] },
];

async function ensureTeam(slug: string, name: string, loanTypes: ("personal" | "bank" | "angkasa" | "car" | "sme")[]) {
  const existing = await db.query.teams.findFirst({
    where: eq(teams.name, name),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(teams)
    .values({ name, loanTypes, brandIds: [], isActive: true })
    .returning({ id: teams.id });
  console.log(`+ team ${slug} (${row.id})`);
  return row.id;
}

async function ensureRule(
  priority: number,
  name: string,
  conditions: unknown,
  teamId: string
) {
  const existing = await db.query.routingRules.findFirst({
    where: eq(routingRules.name, name),
  });
  if (existing) {
    console.log(`= rule "${name}" already exists (id=${existing.id})`);
    return;
  }
  await db.insert(routingRules).values({
    priority,
    name,
    conditions: conditions as object,
    action: {
      type: "assign_team",
      team_id: teamId,
      strategy: "round_robin",
    },
    isActive: true,
  });
  console.log(`+ rule ${priority}: "${name}" → team ${teamId}`);
}

async function main() {
  const teamIds = new Map<string, string>();
  for (const t of TEAM_DEFS) {
    teamIds.set(t.slug, await ensureTeam(t.slug, t.name, t.loanTypes));
  }

  await ensureRule(
    10,
    "VIP first",
    { all: [{ field: "priority_level", op: "eq", value: "vip" }] },
    teamIds.get("senior_agents")!
  );
  await ensureRule(
    20,
    "Angkasa loan → Angkasa specialist",
    { all: [{ field: "loan_type", op: "eq", value: "angkasa" }] },
    teamIds.get("angkasa_specialist")!
  );
  await ensureRule(
    30,
    "SME loan → SME team",
    { all: [{ field: "loan_type", op: "eq", value: "sme" }] },
    teamIds.get("sme")!
  );
  await ensureRule(
    40,
    "Car loan → Car team",
    { all: [{ field: "loan_type", op: "eq", value: "car" }] },
    teamIds.get("car")!
  );
  await ensureRule(
    60,
    "Personal loan catch-all → Personal B",
    { all: [{ field: "loan_type", op: "eq", value: "personal" }] },
    teamIds.get("personal_loan_b")!
  );
  await ensureRule(
    99,
    "General catch-all",
    {
      all: [
        // matches everything that didn't match above
        { field: "loan_type", op: "neq", value: "__never__" },
      ],
    },
    teamIds.get("general_intake")!
  );

  console.log("\n✓ routing rules + teams seeded");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
