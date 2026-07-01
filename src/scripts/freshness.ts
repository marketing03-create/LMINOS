import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const [l] = await sql`select max(updated_at) latest, count(*)::int n from leads where external_record_id is not null`;
  const [s] = await sql`select max(synced_at) latest, count(*)::int n from sales_records where sheet_name='zoho'`;
  const now = new Date();
  const ageMin = (d: Date) => Math.round((now.getTime() - new Date(d).getTime())/60000);
  console.log(`Leads:  ${l.n} rows, last updated ${ageMin(l.latest)} min ago`);
  console.log(`Sales:  ${s.n} rows, last synced ${ageMin(s.latest)} min ago`);
  await sql.end(); process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
