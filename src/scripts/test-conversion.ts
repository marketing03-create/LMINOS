/**
 * End-to-end smoke test for the Telegram Conversion Bot.
 *
 *   npm run test:conversion
 *
 * It runs the REAL recordConversion() against the live DB, then cleans up
 * everything it created, leaving the database exactly as it found it:
 *   1. Ensures a temporary paired "tester" user (telegram_chat_id = test value).
 *   2. Picks a real lead (with a phone, not already approved/closed).
 *   3. Calls recordConversion() as if that tester sent `/sale <phone> <amount>`.
 *   4. Asserts a sales_record (telegram:<leadId>) exists with the revenue, and
 *      the lead advanced to "approved".
 *   5. Reverts the lead status, deletes the test sales_record, and removes the
 *      tester pairing.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { leads, salesRecords, users } from "@/db/schema";
import { recordConversion } from "@/lib/telegram/conversions";

const TEST_CHAT_ID = "test-conversion-chat-000";
const TEST_AMOUNT = 12345;

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

async function main() {
  let pass = true;
  const cleanup: Array<() => Promise<void>> = [];

  // 1. Ensure a paired tester user.
  let tester = await db.query.users.findFirst({
    where: eq(users.telegramChatId, TEST_CHAT_ID),
    columns: { id: true, email: true },
  });
  if (!tester) {
    const [created] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email: "conversion-tester@agent.lmiros.local",
        fullName: "Conversion Tester",
        role: "sales_agent",
        telegramChatId: TEST_CHAT_ID,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { telegramChatId: TEST_CHAT_ID },
      })
      .returning({ id: users.id, email: users.email });
    tester = created;
    cleanup.push(async () => {
      await db.delete(users).where(eq(users.id, created.id));
      log(`  cleaned up tester user ${created.email}`);
    });
  }
  log(`tester: ${tester.email} (chat ${TEST_CHAT_ID})`);

  // 2. Pick a real lead with a phone that isn't already approved/closed.
  const lead = await db.query.leads.findFirst({
    where: and(
      isNotNull(leads.normalizedPhone),
      notInArray(leads.leadStatus, ["approved", "closed", "duplicate_merged"])
    ),
    orderBy: [desc(leads.submittedAt)],
    columns: {
      id: true,
      fullName: true,
      normalizedPhone: true,
      leadStatus: true,
      assignedAgentId: true,
    },
  });
  if (!lead || !lead.normalizedPhone) {
    log("✗ no eligible lead with a phone found — cannot test");
    await runCleanup(cleanup);
    process.exit(1);
  }
  const originalStatus = lead.leadStatus;
  log(
    `lead:   ${lead.fullName ?? "(no name)"} ${lead.normalizedPhone} status=${originalStatus} agent=${lead.assignedAgentId ?? "(none)"}`
  );
  cleanup.push(async () => {
    await db
      .update(leads)
      .set({ leadStatus: originalStatus })
      .where(eq(leads.id, lead.id));
    log(`  reverted lead ${lead.id} status → ${originalStatus}`);
  });

  // 3. Run the conversion.
  log(`\n→ /sale ${lead.normalizedPhone} ${TEST_AMOUNT}`);
  const result = await recordConversion({
    senderChatId: TEST_CHAT_ID,
    phone: lead.normalizedPhone,
    amount: TEST_AMOUNT,
  });
  log(`  bot reply: ${result.message}`);
  if (!result.ok) {
    log("✗ recordConversion returned ok:false");
    pass = false;
  }

  const sheetRowId = `telegram:${lead.id}`;
  cleanup.push(async () => {
    await db.delete(salesRecords).where(eq(salesRecords.sheetRowId, sheetRowId));
    log(`  deleted test sales_record ${sheetRowId}`);
  });

  // 4. Assertions.
  const sale = await db.query.salesRecords.findFirst({
    where: eq(salesRecords.sheetRowId, sheetRowId),
    columns: {
      revenueValue: true,
      salesStatus: true,
      agentId: true,
      leadId: true,
    },
  });
  const advanced = await db.query.leads.findFirst({
    where: eq(leads.id, lead.id),
    columns: { leadStatus: true },
  });

  const expectedAgent = lead.assignedAgentId ?? tester.id;
  const checks: Array<[string, boolean, string]> = [
    ["sales_record created", !!sale, sale ? "ok" : "missing"],
    [
      "revenue = amount",
      Number(sale?.revenueValue) === TEST_AMOUNT,
      `${sale?.revenueValue}`,
    ],
    ["sales_status = approved", sale?.salesStatus === "approved", `${sale?.salesStatus}`],
    ["sale.lead_id linked", sale?.leadId === lead.id, `${sale?.leadId}`],
    ["agent attributed", sale?.agentId === expectedAgent, `${sale?.agentId}`],
    ["lead advanced → approved", advanced?.leadStatus === "approved", `${advanced?.leadStatus}`],
  ];
  log("");
  for (const [name, ok, detail] of checks) {
    log(`  ${ok ? "✓" : "✗"} ${name} (${detail})`);
    if (!ok) pass = false;
  }

  // 5. Idempotency: a second identical conversion must not create a duplicate.
  await recordConversion({
    senderChatId: TEST_CHAT_ID,
    phone: lead.normalizedPhone,
    amount: TEST_AMOUNT,
  });
  const count = (
    await db
      .select({ id: salesRecords.id })
      .from(salesRecords)
      .where(eq(salesRecords.sheetRowId, sheetRowId))
  ).length;
  log(`  ${count === 1 ? "✓" : "✗"} idempotent re-run (rows for key = ${count})`);
  if (count !== 1) pass = false;

  await runCleanup(cleanup);

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"}`);
  process.exit(pass ? 0 : 1);
}

async function runCleanup(cleanup: Array<() => Promise<void>>) {
  log("\ncleanup:");
  // reverse order
  for (const fn of cleanup.reverse()) {
    try {
      await fn();
    } catch (err) {
      log(`  cleanup error: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
