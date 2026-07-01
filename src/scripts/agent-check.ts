import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const [linked] = await sql`select count(*)::int n from leads where external_record_id is not null and assigned_agent_id is not null`;
  const [unlinked] = await sql`select count(*)::int n from leads where external_record_id is not null and assigned_agent_id is null`;
  const agents = await sql`select u.full_name, count(l.id)::int leads, coalesce(sum(case when sr.sales_status in ('approved','closed') then sr.revenue_value else 0 end),0)::float revenue from users u left join leads l on l.assigned_agent_id = u.id left join sales_records sr on sr.lead_id = l.id where u.role='sales_agent' group by u.id, u.full_name order by leads desc`;
  console.log(`Linked leads: ${linked.n} | Unlinked: ${unlinked.n}`);
  console.log("Agents:");
  for (const a of agents) console.log(`  ${a.full_name?.padEnd(12)} ${String(a.leads).padStart(4)} leads, RM ${a.revenue} revenue`);
  await sql.end(); process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
