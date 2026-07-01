import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const acctId = process.argv[2];
  const [acc] = await sql`select id from ad_accounts where external_account_id = ${acctId}`;
  if (!acc) { console.log("no account"); process.exit(0); }
  const d1 = await sql`delete from ad_spend where ad_account_id = ${acc.id}`;
  const d2 = await sql`delete from campaigns where ad_account_id = ${acc.id}`;
  console.log(`deleted ${d1.count} spend rows, ${d2.count} campaigns`);
  await sql.end(); process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
