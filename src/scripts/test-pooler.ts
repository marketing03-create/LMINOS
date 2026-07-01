/**
 * Verify the Supabase transaction pooler URL works.
 * Throwaway debug script.
 */
import postgres from "postgres";

const POOLER_URL =
  "postgresql://postgres.tpscbxchlkzmymhhktea:USGIu0tVIs1yYmIL@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

async function main() {
  const sql = postgres(POOLER_URL, { prepare: false });
  try {
    const [r] = await sql<[{ now: Date; brands: number }]>`
      select now() as now, (select count(*)::int from brands) as brands
    `;
    console.log("✓ pooler works:", r);
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ pooler failed:", err.message);
  process.exit(1);
});
