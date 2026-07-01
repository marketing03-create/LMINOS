import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  // Distinct "Assigned To" + "Agent" values from the synced leads' raw payload.
  const rows = await sql`
    select
      coalesce(raw_payload->>'Assigned To', '') as assigned_to,
      count(*)::int as n
    from leads
    where external_record_id is not null
    group by raw_payload->>'Assigned To'
    order by n desc
  `;
  console.log(`Distinct "Assigned To" values: ${rows.length}`);
  for (const r of rows) console.log(`  ${r.n.toString().padStart(4)} × "${r.assigned_to}"`);
  await sql.end();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
