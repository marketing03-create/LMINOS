import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or DATABASE_URL_POOLED) env var is not set"
  );
}

// Single shared connection — postgres.js handles pooling internally.
// Use the transaction pooler URL (6543) at runtime; migrations use 5432.
const client = postgres(connectionString, {
  prepare: false, // required for Supabase transaction pooler
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema, casing: "snake_case" });
export type DB = typeof db;
