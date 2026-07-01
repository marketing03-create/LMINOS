import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const [zl] = await sql`select count(*)::int n from leads where external_record_id is not null`;
  const [zs] = await sql`select count(*)::int n from sales_records where sheet_name = 'zoho'`;
  const byStatus = await sql`select lead_status, count(*)::int n from leads where external_record_id is not null group by lead_status order by n desc`;
  const sample = await sql`select full_name, normalized_phone, loan_type, lead_status, source_channel from leads where external_record_id is not null order by submitted_at desc limit 5`;
  const [rev] = await sql`select coalesce(sum(revenue_value),0)::float total, count(*)::int n from sales_records where sheet_name='zoho' and sales_status in ('approved','closed')`;
  console.log("Zoho leads:", zl.n, "| Zoho sales_records:", zs.n);
  console.log("By status:", byStatus.map(r => `${r.lead_status}=${r.n}`).join(", "));
  console.log("Approved/closed revenue: RM", rev.total, "across", rev.n, "deals");
  console.log("Sample:");
  for (const s of sample) console.log(`  ${s.full_name} | ${s.normalized_phone} | ${s.loan_type} | ${s.lead_status} | ${s.source_channel}`);
  await sql.end();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
