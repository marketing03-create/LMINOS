/**
 * One-off cleanup: merge duplicate TikTok Live captures of the SAME live into a
 * single row. A duplicate = two+ connector rows sharing (account_id, started_at)
 * — caused by a mid-live reconnect landing under a different externalSessionId
 * (fixed going forward in connector.ts by keying on the live start instant).
 *
 * For each group: keep the row with the most leads (then longest capture), fold
 * the others in with GREATEST per metric (never lowers a number), move any extra
 * keyword-leads onto the kept row, delete the losers, recompute the lead count.
 * Idempotent — re-running after it's clean does nothing.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

async function main() {
  const gRes = await db.execute(sql`
    select account_id, started_at
    from tiktok_live_sessions
    where started_at is not null and (raw_payload->>'manual') is null
    group by account_id, started_at
    having count(*) > 1`);
  const groups = ((gRes as { rows?: unknown }).rows ?? gRes) as {
    account_id: string;
    started_at: string;
  }[];

  console.log(`duplicate groups found: ${groups.length}`);
  let mergedGroups = 0;
  let deletedRows = 0;

  for (const g of groups) {
    const sRes = await db.execute(sql`
      select id from tiktok_live_sessions
      where account_id = ${g.account_id} and started_at = ${g.started_at}
      order by keyword_leads desc, duration_seconds desc, created_at asc`);
    const sessions = ((sRes as { rows?: unknown }).rows ?? sRes) as { id: string }[];
    if (sessions.length < 2) continue;
    const keepId = sessions[0].id;
    const loserIds = sessions.slice(1).map((s) => s.id);

    await db.transaction(async (tx) => {
      // Move leads from each loser to the kept row (skip usernames already there).
      for (const loserId of loserIds) {
        await tx.execute(sql`
          update tiktok_live_leads set session_id = ${keepId}
          where session_id = ${loserId}::uuid
            and username not in (select username from tiktok_live_leads where session_id = ${keepId})`);
      }

      // Fold every metric in with GREATEST; keep the earliest non-null tag/title.
      await tx.execute(sql`
        update tiktok_live_sessions t set
          ended_at          = greatest(t.ended_at, m.ended_at),
          duration_seconds  = m.duration_seconds,
          peak_viewers      = m.peak_viewers,
          avg_viewers       = m.avg_viewers,
          total_views       = m.total_views,
          total_likes       = m.total_likes,
          total_comments    = m.total_comments,
          total_shares      = m.total_shares,
          new_followers     = m.new_followers,
          unique_viewers    = m.unique_viewers,
          active_viewers    = m.active_viewers,
          avg_watch_seconds = m.avg_watch_seconds,
          direct_messages   = m.direct_messages,
          service_bio_views = m.service_bio_views,
          interested_viewers= m.interested_viewers,
          diamonds          = m.diamonds,
          filtered_leads    = m.filtered_leads,
          title             = coalesce(t.title, m.title),
          product           = coalesce(t.product, m.product),
          products          = coalesce(t.products, m.products),
          updated_at        = now()
        from (
          select
            max(ended_at)          ended_at,
            max(duration_seconds)  duration_seconds,
            max(peak_viewers)      peak_viewers,
            max(avg_viewers)       avg_viewers,
            max(total_views)       total_views,
            max(total_likes)       total_likes,
            max(total_comments)    total_comments,
            max(total_shares)      total_shares,
            max(new_followers)     new_followers,
            max(unique_viewers)    unique_viewers,
            max(active_viewers)    active_viewers,
            max(avg_watch_seconds) avg_watch_seconds,
            max(direct_messages)   direct_messages,
            max(service_bio_views) service_bio_views,
            max(interested_viewers) interested_viewers,
            max(diamonds)          diamonds,
            max(filtered_leads)    filtered_leads,
            (select title    from tiktok_live_sessions where account_id = ${g.account_id} and started_at = ${g.started_at} and title    is not null limit 1) title,
            (select product  from tiktok_live_sessions where account_id = ${g.account_id} and started_at = ${g.started_at} and product  is not null limit 1) product,
            (select products from tiktok_live_sessions where account_id = ${g.account_id} and started_at = ${g.started_at} and products is not null limit 1) products
          from tiktok_live_sessions
          where account_id = ${g.account_id} and started_at = ${g.started_at}
        ) m
        where t.id = ${keepId}`);

      // Drop the losers (their remaining leads cascade), then recount.
      for (const loserId of loserIds) {
        await tx.execute(sql`delete from tiktok_live_sessions where id = ${loserId}::uuid`);
      }
      await tx.execute(sql`
        update tiktok_live_sessions set keyword_leads =
          (select count(*)::int from tiktok_live_leads where session_id = ${keepId})
        where id = ${keepId}`);
    });

    mergedGroups++;
    deletedRows += loserIds.length;
    console.log(`  merged group @ ${g.started_at} → kept ${keepId}, removed ${loserIds.length}`);
  }

  console.log(`\nDONE — merged ${mergedGroups} groups, removed ${deletedRows} duplicate rows.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
