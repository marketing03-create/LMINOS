import { db } from '@/db/client';
import { sql } from 'drizzle-orm';

async function main() {
  const r = await db.execute(sql`
    SELECT id, started_at::text,
           unique_viewers, active_viewers, avg_watch_seconds,
           direct_messages, service_bio_views, interested_viewers, diamonds
    FROM tiktok_live_sessions
    ORDER BY started_at DESC
    LIMIT 20
  `);
  const rows = Array.isArray(r) ? r : (r as any).rows ?? r;
  console.log(`\nAll ${rows.length} sessions (manual metric columns):`);
  rows.forEach((row: any) => {
    const hasData = row.unique_viewers != null || row.active_viewers != null || row.diamonds != null;
    console.log(
      row.started_at?.toString().slice(0, 16),
      '| unique:', row.unique_viewers ?? '—',
      '| active:', row.active_viewers ?? '—',
      '| watch:', row.avg_watch_seconds ?? '—',
      '| dms:', row.direct_messages ?? '—',
      '| bio:', row.service_bio_views ?? '—',
      '| interested:', row.interested_viewers ?? '—',
      '| diamonds:', row.diamonds ?? '—',
      hasData ? '✓ HAS DATA' : ''
    );
  });
  const withData = rows.filter((r: any) => r.unique_viewers != null || r.active_viewers != null || r.diamonds != null);
  console.log(`\n${withData.length} sessions have manual data.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
