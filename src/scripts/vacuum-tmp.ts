import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  // DIRECT connection (5432) — the transaction pooler rejects VACUUM, and
  // sql.unsafe() uses the simple-query protocol that VACUUM requires.
  const sql = postgres(url, { prepare: false, max: 1, ssl: "require" });
  try {
    const cutoff = new Date(Date.now() - 90 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    console.log(`ensure search_terms < ${cutoff} removed, then VACUUM FULL…`);
    await sql.unsafe(`delete from search_terms where date < '${cutoff}'`);
    await sql.unsafe(`vacuum (full, analyze) search_terms`);
    const r = await sql.unsafe(
      `select pg_size_pretty(pg_database_size(current_database())) as db_size,
              pg_size_pretty(pg_total_relation_size('search_terms')) as search_terms_size,
              (select count(*)::text from search_terms) as rows`
    );
    console.log("AFTER:", JSON.stringify(r[0] ?? r));
  } finally {
    await sql.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
