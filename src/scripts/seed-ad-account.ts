/**
 * Create/update one ad account tagged to a website, so uploaded spend can be
 * attributed for per-website ROAS.
 *
 * Usage:
 *   npm run seed:ad-account -- <platform> <externalAccountId> <website> [brandSlug] [displayName]
 *
 * Example (Google Ads account 1234567890 driving the flexi_fund_capital site):
 *   npm run seed:ad-account -- google 1234567890 flexi_fund_capital default "Flexi Fund - Google Ads"
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, brands } from "@/db/schema";

async function main() {
  const [platform, externalId, website, brandSlug = "default", displayName] =
    process.argv.slice(2);

  if (!platform || !externalId || !website) {
    console.error(
      'usage: seed:ad-account -- <platform> <externalAccountId> <website> [brandSlug] [displayName]'
    );
    process.exit(1);
  }
  if (!["meta", "google", "tiktok"].includes(platform)) {
    console.error("platform must be meta | google | tiktok");
    process.exit(1);
  }

  const brand = await db.query.brands.findFirst({
    where: eq(brands.slug, brandSlug),
    columns: { id: true },
  });
  if (!brand) {
    console.error(`brand "${brandSlug}" not found — run npm run seed:brands`);
    process.exit(1);
  }

  const existing = await db.query.adAccounts.findFirst({
    where: and(
      eq(adAccounts.platform, platform as "meta" | "google" | "tiktok"),
      eq(adAccounts.externalAccountId, externalId)
    ),
    columns: { id: true },
  });

  const name = displayName ?? `${website} - ${platform}`;
  if (existing) {
    await db
      .update(adAccounts)
      .set({ website, displayName: name, brandId: brand.id, isActive: true })
      .where(eq(adAccounts.id, existing.id));
    console.log(`= updated ad account ${platform}:${externalId} → website "${website}"`);
  } else {
    await db.insert(adAccounts).values({
      platform: platform as "meta" | "google" | "tiktok",
      externalAccountId: externalId,
      displayName: name,
      website,
      brandId: brand.id,
      isActive: true,
    });
    console.log(`+ created ad account ${platform}:${externalId} → website "${website}"`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
