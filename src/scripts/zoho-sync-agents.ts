/**
 * Create sales-agent users from the distinct "Assigned To" names already on
 * the synced leads, then report. Run BEFORE re-running zoho:sync so the lead
 * sync can link assigned_agent_id.
 *
 * Usage: npm run zoho:sync-agents
 */
import { syncAgentsFromLeads } from "@/lib/zoho/agents";

async function main() {
  const out = await syncAgentsFromLeads();
  console.log("Distinct agents:", out.distinctNames.join(", "));
  console.log(`Created ${out.created}, already existed ${out.existing}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("agent sync failed:", err.message);
  process.exit(1);
});
