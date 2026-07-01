/**
 * Print the weekly digest WITHOUT sending it anywhere. For verifying the
 * content/format. Usage: npm run digest:preview
 */
import { buildWeeklyDigest } from "@/lib/insights/digest";

async function main() {
  const { text, alerts } = await buildWeeklyDigest();
  console.log("\n" + text + "\n");
  console.log(`(${alerts.length} alert${alerts.length === 1 ? "" : "s"})`);
  process.exit(0);
}

main().catch((err) => {
  console.error("preview failed:", err.message);
  process.exit(1);
});
