import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, brands, leads } from "@/db/schema";
import type { InboundLead } from "./schema";
import {
  normalizeEmail,
  normalizeLoanType,
  normalizePhoneMY,
  normalizeRegion,
} from "@/lib/normalize";

export class IngestError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "IngestError";
  }
}

export type NormalizedLead = {
  brandId: string;
  loanType: NonNullable<ReturnType<typeof normalizeLoanType>>;
  fullName: string | null;
  phoneRaw: string;
  normalizedPhone: string;
  emailRaw: string | null;
  normalizedEmail: string | null;
  region: ReturnType<typeof normalizeRegion>;
  sourcePlatform: "website" | "meta" | "google" | "tiktok" | "referral" | "manual" | "csv_import";
  sourceChannel: string | null;
  landingPageUrl: string | null;
  keyword: string | null;
  adAccountId: string | null;
  notes: string | null;
  priorityLevel: "hot" | "warm" | "cold" | "vip";
  submittedAt: Date;
  rawPayload: unknown;
};

export async function normalizeInbound(
  input: InboundLead,
  meta: { sourcePlatform: NormalizedLead["sourcePlatform"]; rawPayload: unknown }
): Promise<NormalizedLead> {
  // Phone is mandatory and must normalize cleanly.
  const phone = normalizePhoneMY(input.phone);
  if (!phone.ok) {
    throw new IngestError(`invalid_phone: ${phone.reason}`, "invalid_phone");
  }

  const loanType = normalizeLoanType(input.loan_type);
  if (!loanType) {
    throw new IngestError(
      `unknown_loan_type: ${input.loan_type}`,
      "unknown_loan_type"
    );
  }

  // Brand resolution by slug.
  const brand = await db.query.brands.findFirst({
    where: and(eq(brands.slug, input.brand_slug), eq(brands.isActive, true)),
  });
  if (!brand) {
    throw new IngestError(`unknown_brand: ${input.brand_slug}`, "unknown_brand");
  }

  // Optional ad account resolution.
  let adAccountId: string | null = null;
  if (input.ad_account_external_id) {
    const adAcct = await db.query.adAccounts.findFirst({
      where: eq(adAccounts.externalAccountId, input.ad_account_external_id),
    });
    adAccountId = adAcct?.id ?? null;
  }

  const email = input.email ? normalizeEmail(input.email) : null;

  return {
    brandId: brand.id,
    loanType,
    fullName: input.full_name ?? null,
    phoneRaw: input.phone,
    normalizedPhone: phone.normalized,
    emailRaw: input.email ?? null,
    normalizedEmail: email && email.ok ? email.normalized : null,
    region: normalizeRegion(input.location),
    sourcePlatform: meta.sourcePlatform,
    sourceChannel: input.source_channel ?? null,
    landingPageUrl: input.landing_page_url ?? null,
    keyword: input.keyword ?? null,
    adAccountId,
    notes: input.notes ?? null,
    priorityLevel: input.priority_level ?? "warm",
    submittedAt: input.submitted_at ? new Date(input.submitted_at) : new Date(),
    rawPayload: meta.rawPayload,
  };
}

/**
 * Insert a new lead row and return its id.
 * Does NOT do deduplication — that's the lead.dedupe worker's job.
 */
export async function insertLead(n: NormalizedLead): Promise<string> {
  const [row] = await db
    .insert(leads)
    .values({
      brandId: n.brandId,
      loanType: n.loanType,
      fullName: n.fullName,
      phoneNumberRaw: n.phoneRaw,
      normalizedPhone: n.normalizedPhone,
      emailRaw: n.emailRaw,
      normalizedEmail: n.normalizedEmail,
      sourcePlatform: n.sourcePlatform,
      sourceChannel: n.sourceChannel,
      landingPageUrl: n.landingPageUrl,
      keyword: n.keyword,
      adAccountId: n.adAccountId,
      leadStatus: "new",
      priorityLevel: n.priorityLevel,
      locationRegion: n.region,
      submittedAt: n.submittedAt,
      rawPayload: n.rawPayload as object,
      notes: n.notes,
    })
    .returning({ id: leads.id });

  return row.id;
}
