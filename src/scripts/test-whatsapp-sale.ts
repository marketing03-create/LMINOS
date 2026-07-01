/**
 * End-to-end smoke test for the /sale "create-if-missing" upgrade (WhatsApp-icon
 * customers with no prior lead).
 *
 *   npm run test:whatsapp-sale
 *
 * Reports a sale for a phone that does NOT exist, asserts a new pool-owned
 * `whatsapp_direct` lead is created + a sales_record credits the reporter, and
 * that a re-report is idempotent. Cleans up everything it created.
 */
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leads, salesRecords, users } from "@/db/schema";
import { recordConversion } from "@/lib/telegram/conversions";
import { normalizePhoneMY } from "@/lib/normalize/phone";

const TEST_CHAT_ID = "test-whatsapp-chat-000";
const TEST_AMOUNT = 33333;

function log(...a: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...a);
}

async function main() {
  let pass = true;
  const cleanup: Array<() => Promise<void>> = [];

  // A phone unlikely to exist (timestamp-derived), valid MY mobile format.
  const rawPhone = `012${(Date.now() % 10_000_000).toString().padStart(7, "0")}`;
  const norm = normalizePhoneMY(rawPhone);
  if (!norm.ok) {
    log(`✗ generated phone ${rawPhone} failed normalization — adjust test`);
    process.exit(1);
  }
  // Ensure it really doesn't exist.
  const pre = await db.query.leads.findFirst({
    where: eq(leads.normalizedPhone, norm.normalized),
    columns: { id: true },
  });
  if (pre) {
    log(`✗ test phone ${norm.normalized} already exists — re-run`);
    process.exit(1);
  }

  // Paired tester.
  let tester = await db.query.users.findFirst({
    where: eq(users.telegramChatId, TEST_CHAT_ID),
    columns: { id: true, email: true },
  });
  if (!tester) {
    const [created] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email: "whatsapp-tester@agent.lmiros.local",
        fullName: "WhatsApp Tester",
        role: "sales_agent",
        telegramChatId: TEST_CHAT_ID,
      })
      .onConflictDoUpdate({ target: users.email, set: { telegramChatId: TEST_CHAT_ID } })
      .returning({ id: users.id, email: users.email });
    tester = created;
  }
  cleanup.push(async () => {
    await db.delete(users).where(eq(users.id, tester!.id));
    log(`  cleaned up tester ${tester!.email}`);
  });
  log(`tester: ${tester.email}`);
  log(`\n→ /sale ${rawPhone} ${TEST_AMOUNT}  (no prior lead)`);

  const result = await recordConversion({
    senderChatId: TEST_CHAT_ID,
    phone: rawPhone,
    amount: TEST_AMOUNT,
  });
  log(`  bot reply: ${result.message}`);
  if (!result.ok) pass = false;

  // The created lead.
  const lead = await db.query.leads.findFirst({
    where: eq(leads.normalizedPhone, norm.normalized),
    orderBy: [desc(leads.submittedAt)],
    columns: {
      id: true,
      leadStatus: true,
      sourceChannel: true,
      sourcePlatform: true,
      assignedAgentId: true,
    },
  });
  cleanup.push(async () => {
    if (lead) {
      await db.delete(salesRecords).where(eq(salesRecords.sheetRowId, `telegram:${lead.id}`));
      await db.delete(leads).where(eq(leads.id, lead.id));
      log(`  deleted created lead + sales_record`);
    }
  });

  const sale = lead
    ? await db.query.salesRecords.findFirst({
        where: eq(salesRecords.sheetRowId, `telegram:${lead.id}`),
        columns: { revenueValue: true, salesStatus: true, agentId: true },
      })
    : null;

  const checks: Array<[string, boolean, string]> = [
    ["lead created", !!lead, lead ? "ok" : "missing"],
    ["channel = whatsapp_direct", lead?.sourceChannel === "whatsapp_direct", `${lead?.sourceChannel}`],
    ["source = manual", lead?.sourcePlatform === "manual", `${lead?.sourcePlatform}`],
    ["lead pool-owned (no assignee)", lead?.assignedAgentId == null, `${lead?.assignedAgentId}`],
    ["lead status approved", lead?.leadStatus === "approved", `${lead?.leadStatus}`],
    ["sales_record created", !!sale, sale ? "ok" : "missing"],
    ["revenue = amount", Number(sale?.revenueValue) === TEST_AMOUNT, `${sale?.revenueValue}`],
    ["credited to reporter", sale?.agentId === tester.id, `${sale?.agentId}`],
  ];
  log("");
  for (const [name, ok, detail] of checks) {
    log(`  ${ok ? "✓" : "✗"} ${name} (${detail})`);
    if (!ok) pass = false;
  }

  // Idempotency: re-report same phone → still ONE lead, ONE sales_record.
  await recordConversion({ senderChatId: TEST_CHAT_ID, phone: rawPhone, amount: TEST_AMOUNT });
  const leadCount = (
    await db.select({ id: leads.id }).from(leads).where(eq(leads.normalizedPhone, norm.normalized))
  ).length;
  log(`  ${leadCount === 1 ? "✓" : "✗"} idempotent (leads for phone = ${leadCount})`);
  if (leadCount !== 1) pass = false;

  log("\ncleanup:");
  for (const fn of cleanup.reverse()) {
    try {
      await fn();
    } catch (err) {
      log(`  cleanup error: ${(err as Error).message}`);
    }
  }

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
