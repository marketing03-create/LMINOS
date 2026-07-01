/**
 * Bulk-create Google Ads accounts from a CSV (DB side). Creates the rows only —
 * each account still needs a one-time Google sign-in (per owning Gmail) before
 * its metrics can sync. The pure CSV parsing lives in `parse-account-csv.ts`.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, brands, websites } from "@/db/schema";
import { parseAccountCsv, type ParsedAccountRow } from "./parse-account-csv";

export { parseAccountCsv, type ParsedAccountRow };

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

async function defaultBrandId(): Promise<string | null> {
  const b = await db.query.brands.findFirst({
    where: eq(brands.slug, "default"),
    columns: { id: true },
  });
  return b?.id ?? null;
}

async function resolveWebsiteId(
  slug: string | null,
  brandId: string
): Promise<{ id: string | null; slug: string | null }> {
  if (!slug) return { id: null, slug: null };
  const s = slugify(slug);
  if (!s) return { id: null, slug: null };
  const existing = await db.query.websites.findFirst({
    where: eq(websites.slug, s),
    columns: { id: true },
  });
  if (existing) return { id: existing.id, slug: s };
  const [row] = await db
    .insert(websites)
    .values({ slug: s, name: s, brandId })
    .onConflictDoNothing({ target: websites.slug })
    .returning({ id: websites.id });
  if (row) return { id: row.id, slug: s };
  const again = await db.query.websites.findFirst({
    where: eq(websites.slug, s),
    columns: { id: true },
  });
  return { id: again?.id ?? null, slug: s };
}

export type BulkResult = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  gmails: number; // distinct owning Gmails (= sign-ins needed)
  errors: { line: number; customerId: string; error: string }[];
};

export async function bulkUpsertAccounts(
  rows: ParsedAccountRow[]
): Promise<BulkResult> {
  const brandId = await defaultBrandId();
  if (!brandId) {
    return {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: rows.length,
      gmails: 0,
      errors: [{ line: 0, customerId: "", error: "No default brand configured." }],
    };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: BulkResult["errors"] = [];
  const seen = new Set<string>();
  const gmails = new Set<string>();

  for (const r of rows) {
    if (r.error) {
      skipped++;
      errors.push({ line: r.line, customerId: r.customerId, error: r.error });
      continue;
    }
    if (seen.has(r.customerId)) {
      skipped++;
      continue;
    }
    seen.add(r.customerId);
    if (r.owningEmail) gmails.add(r.owningEmail.toLowerCase());
    try {
      const site = await resolveWebsiteId(r.website, brandId);
      const existing = await db.query.adAccounts.findFirst({
        where: and(
          eq(adAccounts.platform, "google"),
          eq(adAccounts.externalAccountId, r.customerId)
        ),
        columns: { id: true },
      });
      const values = {
        displayName: r.displayName,
        website: site.slug,
        websiteId: site.id,
        owningEmail: r.owningEmail,
        isActive: true,
      };
      if (existing) {
        await db.update(adAccounts).set(values).where(eq(adAccounts.id, existing.id));
        updated++;
      } else {
        await db.insert(adAccounts).values({
          platform: "google",
          externalAccountId: r.customerId,
          brandId,
          ...values,
        });
        created++;
      }
    } catch (e) {
      skipped++;
      errors.push({
        line: r.line,
        customerId: r.customerId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { total: rows.length, created, updated, skipped, gmails: gmails.size, errors };
}
