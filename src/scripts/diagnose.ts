import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const now = new Date();
  const d = (days:number) => new Date(now.getTime() - days*86400000).toISOString();
  const [all] = await sql`select count(*)::int n from leads where external_record_id is not null`;
  const [t30] = await sql`select count(*)::int n from leads where external_record_id is not null and submitted_at >= ${d(30)}`;
  const [t7]  = await sql`select count(*)::int n from leads where external_record_id is not null and submitted_at >= ${d(7)}`;
  const [t1]  = await sql`select count(*)::int n from leads where external_record_id is not null and submitted_at >= ${d(1)}`;
  console.log("Q1 — lead counts by window:");
  console.log(`  all-time=${all.n}  30d=${t30.n}  7d=${t7.n}  today=${t1.n}`);
  console.log("");
  // status distribution
  const st = await sql`select lead_status, count(*)::int n from leads where external_record_id is not null group by lead_status order by n desc`;
  console.log("Q3/Q4 — lead_status distribution:");
  for (const r of st) console.log(`  ${r.lead_status}: ${r.n}`);
  console.log("");
  // rejected pool
  const [rp] = await sql`select count(*)::int n from rejected_leads`;
  const [rejLeads] = await sql`select count(*)::int n from leads where lead_status in ('rejected','not_suitable')`;
  const [rejSales] = await sql`select count(*)::int n from sales_records where sales_status in ('rejected','not_suitable')`;
  console.log("Q4 — rejected pool:");
  console.log(`  rejected_leads table rows: ${rp.n}`);
  console.log(`  leads with rejected/not_suitable status: ${rejLeads.n}`);
  console.log(`  sales_records with rejected status: ${rejSales.n}`);
  console.log("");
  // deal amount / status presence in zoho raw
  const [withStatus] = await sql`select count(*)::int n from leads where external_record_id is not null and coalesce(raw_payload->>'Status','') <> ''`;
  const [withDeal] = await sql`select count(*)::int n from leads where external_record_id is not null and coalesce(raw_payload->>'Deal Amount','0') not in ('0','')`;
  console.log("Q2/Q3 — outcome data present in Zoho rows:");
  console.log(`  rows with non-empty Status: ${withStatus.n}`);
  console.log(`  rows with non-zero Deal Amount: ${withDeal.n}`);
  await sql.end(); process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
