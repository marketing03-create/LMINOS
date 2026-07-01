# LMIROS — Deploy status

**Last updated:** 2026-05-31

## ✅ What's live in production

- **URL:** https://lmiros.vercel.app (alias) → `lmiros-bl3z07z1q-kai25.vercel.app`
- **Region:** `sin1` (Singapore)
- **Vercel project:** `kai25/lmiros` (Hobby tier)
- **Supabase:** `tpscbxchlkzmymhhktea.supabase.co` — all 18 tables migrated, 2 brands + 7 teams + 6 routing rules + 1 test agent seeded
- **Upstash Redis:** `inviting-mite-71159.upstash.io` (Singapore)

## ✅ Verified working end-to-end

1. `POST https://lmiros.vercel.app/api/ingest/website` with HMAC → returns 200 with idempotency_key
2. Vercel handler enqueues to Upstash Redis
3. Local worker (`npm run worker`) drains the queue
4. `lead.ingest` → `lead.dedupe` → `lead.route` → `lead.notify` pipeline runs
5. **Cross-environment dedupe** detected the live lead as a duplicate of a prior local test (same phone)
6. Auth gate on `/dashboard` correctly redirects to `/login` (HTTP 307)

## ⚠️ What is NOT live yet

| What | Why | Where to address |
|---|---|---|
| **BullMQ worker hosting** | Vercel Functions are short-lived; can't run long-lived consumers | Deploy `npm run worker` to Fly.io / Railway / Render (~$5/mo) |
| **Real-time crons** | Vercel **Hobby** caps cron frequency at 1×/day | Upgrade to Pro ($20/mo) and uncomment the Pro block in `vercel.ts`, OR trigger `/api/cron/*` from cron-job.org with `Authorization: Bearer ${CRON_SECRET}` |
| **Google SSO login** | Supabase Auth → Google provider not yet configured | Supabase → Authentication → Providers → enable Google with OAuth credentials |
| **Dashboard accessibility** | Without SSO, no one can sign in → `/dashboard` always redirects to `/login` | Either configure SSO OR re-enable `LMIROS_DEV_BYPASS_AUTH=true` (insecure, but works for staging) |
| **Telegram alerts** | `TELEGRAM_BOT_TOKEN` not set | @BotFather → create bot → push token via `printf 'TOKEN' \| vercel env add TELEGRAM_BOT_TOKEN production` |
| **Google Sheets sync** | `GOOGLE_SERVICE_ACCOUNT_JSON_B64` not set | GCP service account → download JSON → base64-encode → push to Vercel env |
| **Meta / Google Ads / TikTok webhooks** | Real platform secrets still set to stub values; webhook URLs not registered on the platforms | See `README.md` and `docs/UAT.md` |
| **Supabase RLS** | Not enabled — middleware-level auth only | Write SQL policies on `leads` / `sales_records` / `rejected_leads` / `notifications` |
| **Production worker** | Currently runs on local dev machine | Hosting decision above |

## 🚧 Critical: Worker hosting decision

The webhook accepts leads and pushes them to Redis, but **nothing is processing them in production**. Right now the queue fills up until a local `npm run worker` drains it.

Options:
1. **Fly.io machine** — ~$2-5/mo, deploy `npm run worker` as a single VM. Best for Phase 1.
2. **Railway** — easier UX, ~$5/mo.
3. **Vercel Queues (beta)** — refactor BullMQ → Vercel Queues, no separate hosting. ~3-4h refactor.
4. **Cron-pulled processing** — refactor the worker to a Vercel Function that's called every minute by Vercel Cron to drain the queue. Requires Pro tier and changes the BullMQ pattern.

Recommend (1) Fly.io for fastest path to production-grade worker.

## 🔑 Env vars currently in Vercel (production)

All pushed via `bash scripts/push-env.sh` (the PowerShell version added a BOM that broke `DATABASE_URL` and `CRON_SECRET`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DATABASE_URL_POOLED` (currently same as DATABASE_URL — switch to transaction pooler port 6543 for high load)
- `REDIS_URL`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `WEBHOOK_SECRET_WEBSITE` (stub: `dev-secret-change-me` — rotate before going live)
- `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_DEFAULT_BRAND_SLUG` (stubs)
- `GOOGLE_ADS_WEBHOOK_TOKEN` (stub)
- `TIKTOK_WEBHOOK_SECRET` (stub)

**NOT pushed (intentionally):** `LMIROS_DEV_BYPASS_AUTH`. Auth bypass must never run in production.

## 📋 Recommended next steps (in order)

1. **Decide on worker hosting** (Fly.io / Railway / Vercel Queues). I can drive any of them.
2. **Rotate `WEBHOOK_SECRET_WEBSITE`** to a real secret before pointing any external traffic at the URL.
3. **Set up Telegram bot** so HQ can see lead alerts.
4. **Set up Google SSO** so the dashboard is usable.
5. **Set up Google Sheets sync** so sales outcomes flow back.
6. **Add real Meta / Google Ads / TikTok credentials** and register webhook URLs on each platform.
7. **Upgrade to Vercel Pro** if you want real-time cron, OR set up cron-job.org as a free alternative.
8. **Write Supabase RLS policies** for defense-in-depth.

## 🐛 Bugs fixed during deploy

| Bug | Fix |
|---|---|
| PowerShell `\|` pipe injected UTF-8 BOM into env values, breaking `DATABASE_URL` and `CRON_SECRET` | Switched to `bash scripts/push-env.sh` with `printf '%s'` (no newline, no BOM) |
| `/login/page.tsx` used `useSearchParams()` without Suspense → blocked SSG build | Wrapped form in `<Suspense>`, added `export const dynamic = "force-dynamic"` |
| `vercel.ts` imported `@vercel/config/v1` but the package wasn't in `dependencies` | `npm install @vercel/config` |
| `vercel.ts` cron schedules `* * * * *` and `*/2 * * * *` rejected by Hobby plan | Reduced to `0 0 * * *` daily for now; Pro-tier schedules in commented block |
