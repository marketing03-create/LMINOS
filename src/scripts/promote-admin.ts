import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const email = process.argv[2];
async function main() {
  if (!email) { console.error("usage: promote-admin <email>"); process.exit(1); }
  const r = await sql`
    update public.users set role = 'hq_admin' where email = ${email}
    returning email, role
  `;
  if (r.length === 0) console.log(`No user with email ${email}`);
  else console.log(`✓ ${r[0].email} is now ${r[0].role}`);
  await sql.end();
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
