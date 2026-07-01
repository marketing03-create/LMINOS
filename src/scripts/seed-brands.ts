/**
 * Minimal brand seed so the ingest pipeline can resolve brand_slug
 * during end-to-end testing.
 *
 * Run: npx tsx src/scripts/seed-brands.ts
 *
 * Real brand list (~per plan §20 question 2) should replace this once
 * the business confirms it.
 */
import { db } from "@/db/client";
import { brands } from "@/db/schema";

const SEED = [
  { name: "Default Brand", slug: "default", isActive: true },
  { name: "Test Brand", slug: "test", isActive: true },
];

async function main() {
  for (const b of SEED) {
    const res = await db
      .insert(brands)
      .values(b)
      .onConflictDoNothing({ target: brands.slug })
      .returning({ id: brands.id, slug: brands.slug });
    if (res.length > 0) {
      console.log(`+ brand ${res[0].slug} (${res[0].id})`);
    } else {
      console.log(`= brand ${b.slug} already exists`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
