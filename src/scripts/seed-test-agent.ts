/**
 * Seed a single test sales_agent user on the "Personal loan B" team so the
 * routing pipeline has someone to assign leads to. Phase 1.5 will use real
 * Supabase Auth users; this is purely for dev smoke-testing.
 *
 * Run: npm run seed:test-agent
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams, users } from "@/db/schema";

const TEST_AGENT = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test-agent@lmiros.local",
  fullName: "Test Agent (smoke-test)",
};

const TEAM_NAME = "Personal loan B (catch-all)";

async function main() {
  const team = await db.query.teams.findFirst({
    where: eq(teams.name, TEAM_NAME),
  });
  if (!team) {
    throw new Error(
      `team "${TEAM_NAME}" not found. Run npm run seed:routing first.`
    );
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, TEST_AGENT.email),
  });

  if (existing) {
    console.log(`= test agent already exists: ${existing.id}`);
  } else {
    await db.insert(users).values({
      id: TEST_AGENT.id,
      email: TEST_AGENT.email,
      fullName: TEST_AGENT.fullName,
      role: "sales_agent",
      teamId: team.id,
      isActive: true,
      dailyCapacity: 50,
    });
    console.log(`+ test agent ${TEST_AGENT.email} on team "${team.name}"`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
