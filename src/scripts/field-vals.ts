import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function dist(field: string) {
  const rows = await sql.unsafe(`
    select coalesce(raw_payload->>'${field}','(empty)') v, count(*)::int n
    from leads where external_record_id is not null
    group by raw_payload->>'${field}' order by n desc limit 15`);
  console.log(`\n${field}:`);
  for (const r of rows) console.log(`  ${String(r.n).padStart(4)} × "${r.v}"`);
}
async function main() {
  for (const f of ["Loan Type","Location","Employment Type","Salary Through"]) await dist(f);
  await sql.end(); process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
