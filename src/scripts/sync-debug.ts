import { syncZoho } from "@/lib/zoho/sync";
async function main() {
  try {
    const out = await syncZoho();
    console.log("OK", JSON.stringify(out).slice(0,200));
  } catch (e: unknown) {
    const err = e as { message?: string; cause?: unknown; query?: string };
    console.error("MESSAGE:", err.message?.slice(0, 150));
    console.error("CAUSE:", JSON.stringify(err.cause ?? (e as Error).cause ?? "none").slice(0, 400));
    // postgres.js puts detail on the error object directly
    const pg = e as Record<string, unknown>;
    console.error("PG fields:", JSON.stringify({code:pg.code, detail:pg.detail, constraint:pg.constraint, column:pg.column, table:pg.table, message_pg:pg.message}).slice(0,500));
  }
  process.exit(0);
}
main();
