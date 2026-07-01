# LMIROS — Operator's Guide

**What it is:** an internal analytics system that mirrors your Zoho loan-submission sheet in real time and shows **per-website** and **per-agent** performance plus **real ROAS** (revenue ÷ Google Ads spend).

**Live at:** https://lmiros.vercel.app
**Last updated:** 2026-06-03

---

## 1. What's live today

| Capability | Where | Status |
|---|---|---|
| Real-time sync of Zoho submissions + outcomes | auto, every 10 min | ✅ |
| Per-website performance | `/roas?by=website` | ✅ |
| Per-agent performance | `/agents`, `/roas?by=agent` | ✅ |
| Real ROAS (revenue ÷ spend) | `/roas` | ✅ |
| Lead list + detail | `/leads`, `/leads/[id]` | ✅ |
| Synced sales outcomes | `/sales` | ✅ |
| Rejected / recycle pool | `/rejected` | ✅ |
| Google SSO login | `/login` | ✅ |
| Telegram new-lead alerts | (bot `@lmiros_alerts_bot`) | ✅ built; optional |
| Audit log | `/admin/audit` | ✅ |

**Current data:** ~1,016 leads, 3 agents (Luke, Mario, Adrian), 1 website (`flexi_fund_capital`), RM 8,975.50 Google Ads spend (May–Jun 2026).

---

## 2. How the data flows (plain English)

```
Your websites → Zoho form → Zoho Sheet "sheet_1"
                                   │
                  every 10 min (cron-job.org)
                                   ▼
              GET /api/cron/zoho-sync  →  LMIROS pulls all rows
                                   ▼
        leads + sales_records + agents updated in Supabase
                                   ▼
   Dashboards (refreshes on next page load): /agents · /roas · /sales
                                   ▲
              Weekly: you upload Google Ads spend  →  enables ROAS
```

- **Zoho is the source of truth.** LMIROS never writes back to Zoho — it only reads.
- Each Zoho row = one lead **and** its outcome (Status, Deal Amount, Assigned To).
- Re-syncing the same row updates in place (idempotent) — no duplicates.

---

## 3. Reading each dashboard

### `/roas?by=website`  (the headline view)
Each website row shows: **Leads · Approved · Spend · CPL · CPA · Close rate · Revenue · Real ROAS**.
- **Real ROAS** = revenue ÷ ad spend. Green ≥ 3×, neutral 1–3×, red < 1×.
- Switch the **date range** (7d / 30d / 90d) — both leads and spend are filtered to that window.

### `/roas?by=agent`
Same metrics grouped by agent. Use it to compare agent productivity.

### `/agents`
Leaderboard: assigned / contacted / close rate / avg response / revenue per agent. Click an agent for their detail + recent leads.

### `/leads`
All leads, newest first. Click any for full detail, timeline, and linked sale.

### `/sales` and `/sales/unmatched`
Synced outcomes. (Unmatched is for the live-webhook path, not Zoho — Zoho rows link directly.)

> **Important caveat on ROAS:** ROAS is only as good as the **outcome data in Zoho**. Today only ~30 of ~1,016 leads have a recorded Status/Deal Amount, so recent-window ROAS reads low. It becomes accurate automatically once the team records outcomes per deal.

---

## 4. Weekly / recurring operations

### A. Update Google Ads spend (weekly) — keeps ROAS current
1. In **Google Ads → Campaigns**, set the date range, segment by **Day** if you want daily detail, ensure the **Cost** column is shown.
2. **Download → CSV**.
3. Run (from the `lmiros` folder):
   ```
   npm run import:gads-spend -- "C:\path\to\Campaign report.csv" 5998534374
   ```
   (`5998534374` = the Google Ads account ID for flexi_fund_capital, already registered.)
   - It skips the "Total:" rows and spreads the period cost across days.
   - Re-running the same file is safe (upsert).
4. New website/account? First register it:
   ```
   npm run seed:ad-account -- google <ACCOUNT_ID> <website_name> default "Display Name"
   ```

### B. Agents — fully automatic
New agents appear by themselves: the sync creates a user the first time it sees a new name in Zoho's "Assigned To". Nothing to do.

### C. Manual sync (if you don't want to wait 10 min)
- Click **"Sync Zoho now"** on `/admin/integrations`, **or** it runs every 10 min via cron-job.org.

---

## 5. Services & where things live

| Service | Purpose | Account |
|---|---|---|
| **Vercel** (`kai25/lmiros`) | Hosts the web app + API | marketing.03@enquirymail.com |
| **Supabase** (`tpscbxchlkzmymhhktea`, Singapore) | Database + Google SSO | — |
| **Upstash Redis** (Singapore) | Queue (for the live-webhook path) | — |
| **cron-job.org** | Triggers the 10-min Zoho sync | — |
| **Zoho** | Source sheet (Self Client API) | — |
| **Telegram** (`@lmiros_alerts_bot`) | Lead alerts (optional) | — |
| **Google Cloud** | OAuth (SSO) + (future) Sheets | — |

All secrets are in Vercel env vars + local `.env.local` (never committed). Key env var names: `DATABASE_URL(_POOLED)`, `REDIS_URL`, `ZOHO_*`, `TELEGRAM_*`, `CRON_SECRET`, `ENCRYPTION_KEY`.

**Cost today: ~RM 0/month** (all free tiers). Paid only needed at real launch (Fly.io worker ~$5, Vercel Pro ~$20 for sub-daily native cron — not required while cron-job.org drives the sync).

---

## 6. Useful commands (run inside the `lmiros` folder)

| Command | What it does |
|---|---|
| `npm run zoho:sync` | Pull Zoho now (local) |
| `npm run import:gads-spend -- "<csv>" <acctId>` | Import Google Ads spend |
| `npm run seed:ad-account -- google <id> <website> default "<name>"` | Register an ad account ↔ website |
| `npm run dev` | Run the app locally (http://localhost:3000) |
| `npm run db:studio` | Browse the database in a GUI |
| `npm test` | Run the test suite (88 tests) |

> Production sync runs server-side on Vercel via cron-job.org — you don't need to run anything locally for the live site to stay fresh.

---

## 7. Known limitations & next steps

| Item | Note |
|---|---|
| **Outcome data gap** | ~97% of leads have no Status/Deal Amount in Zoho. **Highest-value fix: have the team record outcomes per deal.** |
| **Per-campaign ROAS (F)** | Today ROAS is per-website. To see which *Google Ads campaign* drives sales, add `utm_campaign`/`gclid` capture to the Zoho form, then we map it. |
| **Spend granularity** | Google Ads export is a period total; we spread it evenly across days (±cents rounding). Segment by Day in the export for true daily numbers. |
| **Security (pre-launch)** | Rotate the Telegram bot token + `WEBHOOK_SECRET_WEBSITE` (they appeared during setup). Add Supabase RLS for cross-team isolation. |
| **24/7 worker** | The live-webhook path needs a hosted worker (Fly.io) — only relevant if you add real-time webhooks beyond Zoho. The Zoho sync does NOT need it. |

---

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Dashboard shows no recent data | Is the cron-job.org job **enabled**? Test-run it; expect `{"ok":true,...}`. |
| ROAS shows 0 in a range | Are there recorded outcomes (Status/Deal Amount) for leads in that window? Mostly a data gap, not a bug. |
| Spend missing on `/roas?by=website` | Did you import spend (`import:gads-spend`) and is the ad account tagged with the right `website`? |
| Can't log in | Google SSO must be enabled in Supabase; your email must exist in `public.users`. |
| New agent not showing | They appear after the next sync once they have ≥1 assigned lead in Zoho. |

---

## 9. Quick health check

Run from the `lmiros` folder to confirm everything's connected:
```
npm run ping        # Redis + DB + row counts
```
Or hit the live sync: cron-job.org "Run now" → should return `{"ok":true,"fetched":~1026,"leadsUpserted":~1016,...}`.
