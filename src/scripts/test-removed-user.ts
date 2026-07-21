/**
 * Verifies the "removed user stays removed" fix end-to-end against the real DB,
 * using a clearly-fake agent so it never touches real data, and fully cleaning
 * up afterwards.
 *
 *   Case A: a not-suppressed agent is auto-created by the sync (baseline).
 *   Case B: after removal (delete + tombstone), the sync must NOT recreate them.
 *
 * Run: npm run test:removed-user
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { removedUsers, users } from "@/db/schema";
import { agentEmail } from "@/lib/zoho/agents";
import { ensureAgentId } from "@/lib/zoho/sync";

const NAME = "Zz Suppress Test Agent";
const RAW = `${NAME} - 60123456789`;
const EMAIL = agentEmail(NAME); // deterministic synthetic email

async function cleanup() {
  await db.delete(users).where(eq(users.email, EMAIL));
  await db.delete(removedUsers).where(eq(removedUsers.email, EMAIL));
}

async function main() {
  await cleanup(); // clean slate

  // Case A — not suppressed: the sync auto-creates the agent (baseline behaviour).
  const idA = await ensureAgentId(RAW, new Map(), new Set());
  const createdA = await db.query.users.findFirst({ where: eq(users.email, EMAIL) });
  console.log(`A · auto-create: id=${idA ? "set" : "null"} userExists=${!!createdA}`);

  // Simulate the admin "Remove" action: delete the row + tombstone the email.
  await db.delete(users).where(eq(users.email, EMAIL));
  await db.insert(removedUsers).values({ email: EMAIL }).onConflictDoNothing();

  // Case B — suppressed: a fresh sync must NOT bring them back.
  const suppressed = new Set(
    (await db.select({ email: removedUsers.email }).from(removedUsers)).map((r) =>
      r.email.toLowerCase()
    )
  );
  const idB = await ensureAgentId(RAW, new Map(), suppressed);
  const recreatedB = await db.query.users.findFirst({ where: eq(users.email, EMAIL) });
  console.log(`B · after removal: id=${idB === null ? "null" : "SET"} userRecreated=${!!recreatedB}`);

  const pass = !!idA && !!createdA && idB === null && !recreatedB;
  await cleanup();
  console.log(pass ? "\nPASS ✅ — removed user is not resurrected" : "\nFAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
