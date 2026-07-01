import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const rows = await sql`
    select coalesce(raw_payload->>'Status','(empty)') as status, count(*)::int n
    from leads where external_record_id is not null
    group by raw_payload->>'Status' order by n desc limit 20`;
  console.log("Distinct Zoho 'Status' values:");
  for (const r of rows) console.log(`  ${String(r.n).padStart(4)} × "${r.status}"`);
  console.log("");
  const deal = await sql`
    select coalesce(raw_payload->>'Deal Amount','(empty)') as d, count(*)::int n
    from leads where external_record_id is not null
    group by raw_payload->>'Deal Amount' order by n desc limit 10`;
  console.log("Distinct Zoho 'Deal Amount' values:");
  for (const r of deal) console.log(`  ${String(r.n).padStart(4)} × "${r.d}"`);
  await sql.end(); process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
