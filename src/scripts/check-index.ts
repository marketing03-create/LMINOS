import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const idx = await sql`select indexname from pg_indexes where tablename='rejected_leads'`;
  console.log("rejected_leads indexes:", idx.map(r=>r.indexname).join(", "));
  await sql.end(); process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
