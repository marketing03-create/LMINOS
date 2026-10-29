import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every table in `public` must have Row Level Security on. Supabase exposes the
 * public schema over REST to the anon key that ships in every browser, so a
 * table without RLS is readable and writable by anyone. Two tables slipped
 * through this way (fixed in 0034); this keeps a third from shipping.
 *
 * File-based on purpose: it reads the migrations, so it needs no database.
 */
const dir = join(__dirname, "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"));

const name = String.raw`"?(?:public"?\.)?"?(\w+)"?`;
const created = new Set<string>();
const dropped = new Set<string>();
const protectedTables = new Set<string>();

// Walk the migrations in order. 0014 turns RLS on with a loop over every
// table that existed at the time, so a "blanket" migration covers all tables
// created before it; anything newer needs its own ALTER TABLE.
for (const sql of files) {
  for (const m of sql.matchAll(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${name}`, "gi"))) created.add(m[1]);
  for (const m of sql.matchAll(new RegExp(`DROP TABLE (?:IF EXISTS )?${name}`, "gi"))) dropped.add(m[1]);
  for (const m of sql.matchAll(new RegExp(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`, "gi")))
    protectedTables.add(m[1]);
  if (/FROM pg_tables[\s\S]*ENABLE ROW LEVEL SECURITY/i.test(sql)) {
    for (const t of created) protectedTables.add(t);
  }
}

describe("migrations", () => {
  it("turn on Row Level Security for every table they create", () => {
    const missing = [...created].filter((t) => !dropped.has(t) && !protectedTables.has(t));
    expect(missing, `add "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" for: ${missing.join(", ")}`).toEqual([]);
  });
});
