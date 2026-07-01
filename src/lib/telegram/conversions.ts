/**
 * Record a sales conversion reported by an agent via Telegram.
 *
 * Agents close deals and report them in Telegram (their existing habit), e.g.
 *   /sale 0123456789 25000
 *
 * This is the bridge for the fact that real conversions live in Telegram, not
 * in the Zoho sheet. The conversion is stored as a sales_record in a separate
 * `telegram:` namespace so the Zoho sync never overwrites it, and the matched
 * lead is advanced to "approved" (forward-only — the Zoho sync won't downgrade
 * it back).
 */
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { brands, leads, salesRecords, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit/write";
import { normalizePhoneMY } from "@/lib/normalize/phone";
import { parseSaleCommand } from "./parse-sale";

export { parseSaleCommand };
export type ConversionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

// Customers who reach an agent via the website's WhatsApp icon never submit a
// form, so there's no lead. We create one in this channel so the sale is still
// tracked + attributed. The slug groups these on the ROAS "website" view; HQ
// can create a matching website in admin to manage its pool.
const WHATSAPP_CHANNEL = "whatsapp_direct";

/** Find (or lazily create) the default brand so a WhatsApp lead can be created. */
async function defaultBrandId(): Promise<string> {
  const found = await db.query.brands.findFirst({
    where: eq(brands.slug, "default"),
    columns: { id: true },
  });
  if (found) return found.id;
  const [row] = await db
    .insert(brands)
    .values({ name: "Default Brand", slug: "default", isActive: true })
    .onConflictDoNothing({ target: brands.slug })
    .returning({ id: brands.id });
  if (row) return row.id;
  const again = await db.query.brands.findFirst({
    where: eq(brands.slug, "default"),
    columns: { id: true },
  });
  return again!.id;
}

export async function recordConversion(input: {
  senderChatId: string;
  phone: string;
  amount: number;
}): Promise<ConversionResult> {
  // 1. Sender must be a paired user (so we know who's reporting + for audit).
  const sender = await db.query.users.findFirst({
    where: eq(users.telegramChatId, input.senderChatId),
    columns: { id: true, fullName: true, email: true },
  });
  if (!sender) {
    return {
      ok: false,
      message:
        "You're not linked yet. Send /start your.email@company.com first, then report the sale.",
    };
  }

  // 2. Normalize phone + find the lead.
  const phone = normalizePhoneMY(input.phone);
  if (!phone.ok) {
    return { ok: false, message: `Invalid phone number: "${input.phone}".` };
  }
  let lead = await db.query.leads.findFirst({
    where: and(
      eq(leads.normalizedPhone, phone.normalized),
      ne(leads.leadStatus, "duplicate_merged")
    ),
    orderBy: [desc(leads.submittedAt)],
    columns: { id: true, fullName: true, assignedAgentId: true, brandId: true, loanType: true },
  });

  // 2b. No lead (e.g. a WhatsApp-icon customer who never submitted a form) —
  // create one so the sale is still tracked + attributed to the closer.
  let createdLead = false;
  if (!lead) {
    const brandId = await defaultBrandId();
    const [row] = await db
      .insert(leads)
      .values({
        brandId,
        loanType: "personal",
        phoneNumberRaw: input.phone,
        normalizedPhone: phone.normalized,
        sourcePlatform: "manual",
        sourceChannel: WHATSAPP_CHANNEL,
        leadStatus: "approved",
        // Pool-owned (shared-pool model): credit the closer on the sale, below.
        assignedAgentId: null,
        notes: `Created from a Telegram /sale by ${sender.email} (no prior lead).`,
      })
      .returning({
        id: leads.id,
        fullName: leads.fullName,
        assignedAgentId: leads.assignedAgentId,
        brandId: leads.brandId,
        loanType: leads.loanType,
      });
    lead = row;
    createdLead = true;
  }

  // 3. Credit the lead's assigned agent if it has one; else the reporter
  //    (under the shared-pool model leads are unassigned → the closer is credited).
  const agentId = lead.assignedAgentId ?? sender.id;

  // 4. Upsert the conversion as a sales_record in the telegram namespace.
  const sheetRowId = `telegram:${lead.id}`;
  const existing = await db.query.salesRecords.findFirst({
    where: eq(salesRecords.sheetRowId, sheetRowId),
    columns: { id: true },
  });
  const values = {
    leadId: lead.id,
    sheetRowId,
    sheetName: "telegram",
    normalizedPhone: phone.normalized,
    agentNameRaw: sender.fullName ?? sender.email,
    agentId,
    loanType: lead.loanType,
    salesStatus: "approved" as const,
    approvalStatus: "approved",
    salesAmount: input.amount.toFixed(2),
    revenueValue: input.amount.toFixed(2),
    remarks: `Reported via Telegram by ${sender.email}`,
    matchConfidence: "exact_phone" as const,
    syncedAt: new Date(),
  };
  if (existing) {
    await db.update(salesRecords).set(values).where(eq(salesRecords.id, existing.id));
  } else {
    await db.insert(salesRecords).values(values);
  }

  // 5. Advance the lead to approved.
  await db.update(leads).set({ leadStatus: "approved" }).where(eq(leads.id, lead.id));

  await writeAudit({
    actorUserId: sender.id,
    eventType: "sales.converted_via_telegram",
    entityType: "lead",
    entityId: lead.id,
    after: { amount: input.amount, agent_id: agentId, reporter: sender.email },
  });

  const who = lead.fullName ?? phone.normalized;
  return {
    ok: true,
    message: createdLead
      ? `No existing lead for ${phone.normalized} — created a WhatsApp lead and recorded RM ${input.amount.toLocaleString()}. ✅`
      : `Recorded RM ${input.amount.toLocaleString()} sale for ${who}. ✅`,
  };
}
