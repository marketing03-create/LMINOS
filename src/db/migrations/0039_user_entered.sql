ALTER TABLE "tiktok_live_sessions" ADD COLUMN "user_entered" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- Backfill from the audit log: a connector field counts as person-entered when a
-- person's edit (typed, screenshot, or a live added by hand) set it to the value
-- the row still holds — so a number the connector later raised stays Fly.io's.
UPDATE "tiktok_live_sessions" s
SET "user_entered" = sub.keys
FROM (
  SELECT x.id, array_agg(DISTINCT x.key ORDER BY x.key) AS keys
  FROM (
    SELECT s2.id, k.key
    FROM "audit_logs" a
    JOIN "tiktok_live_sessions" s2 ON s2.id::text = a.entity_id
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.after) = 'object' THEN a.after ELSE '{}'::jsonb END) k
    WHERE a.entity_type = 'tiktok_live_session'
      AND a.event_type IN (
        'tiktok_live_session.manual_metrics',
        'tiktok_live_session.screenshot_import',
        'tiktok_live_session.manual_created'
      )
      AND jsonb_typeof(k.value) = 'number'
      AND (k.value #>> '{}')::numeric = CASE k.key
        WHEN 'totalViews' THEN s2.total_views
        WHEN 'peakViewers' THEN s2.peak_viewers
        WHEN 'avgViewers' THEN s2.avg_viewers
        WHEN 'totalLikes' THEN s2.total_likes
        WHEN 'totalComments' THEN s2.total_comments
        WHEN 'totalShares' THEN s2.total_shares
        WHEN 'newFollowers' THEN s2.new_followers
        WHEN 'durationSeconds' THEN s2.duration_seconds
        WHEN 'keywordLeads' THEN s2.keyword_leads
      END
  ) x
  GROUP BY x.id
) sub
WHERE s.id = sub.id;--> statement-breakpoint
-- A live added by hand never touched the connector: every captured-type number
-- on it (including the 0s it was created with) came from a person.
UPDATE "tiktok_live_sessions"
SET "user_entered" = ARRAY['avgViewers','durationSeconds','keywordLeads','newFollowers','peakViewers','totalComments','totalLikes','totalShares','totalViews']::text[]
WHERE "external_session_id" LIKE 'manual-%';
