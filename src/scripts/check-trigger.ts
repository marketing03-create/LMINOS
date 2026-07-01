import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const trig = await sql`
    select tgname from pg_trigger where tgname = 'on_auth_user_created'
  `;
  console.log("auth trigger installed:", trig.length > 0 ? "YES ✓" : "NO ✗");
  const users = await sql`select id, email, role from public.users order by created_at`;
  console.log(`public.users rows: ${users.length}`);
  for (const u of users) console.log(`  ${u.email}  [${u.role}]`);
  await sql.end();
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
