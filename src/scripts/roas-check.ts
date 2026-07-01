import { aggregateByDimension, defaultRange } from "@/lib/roas/aggregate";
async function main() {
  for (const days of [30, 90, 365]) {
    const range = defaultRange(days);
    const rows = await aggregateByDimension("website", range);
    console.log(`\n=== range ${days}d (${range.start.toISOString().slice(0,10)} → ${range.end.toISOString().slice(0,10)}) ===`);
    for (const r of rows) {
      const m = r.metrics;
      console.log(`  ${r.label}: leads=${m.leads} approved=${m.approved+m.closed} spend=RM${m.spend} revenue=RM${m.revenue} ROAS=${m.realRoas ?? 'n/a'}`);
    }
  }
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
