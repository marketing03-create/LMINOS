import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const byReason = await sql`select rejection_reason, count(*)::int n, bool_or(resale_eligible) resale, bool_or(recycle_eligible) recycle from rejected_leads group by rejection_reason order by n desc`;
  console.log("Rejected pool by reason:");
  for (const r of byReason) console.log(`  ${String(r.n).padStart(4)} × ${r.rejection_reason}  (resale=${r.resale} recycle=${r.recycle})`);
  const [tot] = await sql`select count(*)::int n from rejected_leads`;
  const [resale] = await sql`select count(*)::int n from rejected_leads where resale_eligible`;
  const [recycle] = await sql`select count(*)::int n from rejected_leads where recycle_eligible`;
  console.log(`\nTotal pool: ${tot.n} | Resale-eligible: ${resale.n} | Recycle-eligible: ${recycle.n}`);
  await sql.end(); process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
