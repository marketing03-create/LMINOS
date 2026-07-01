# LMIROS — Loan Marketing Intelligence & Revenue OS

Internal web app that ingests leads from Meta / Google / TikTok / website, deduplicates them, routes to 80+ agents under a 5-min SLA, syncs sales outcomes from Google Sheets, and reports **real ROAS** per campaign.

Plan: `../.claude/plans/try-again-velvet-beaver.md`

## Status

**🚀 Live in production at https://lmiros.vercel.app**

**Phase 1 MVP complete.** 8 weekly milestones from the plan delivered. 88/88 tests passing. UAT checklist at [docs/UAT.md](docs/UAT.md). Full deploy status + remaining work at [docs/DEPLOY-STATUS.md](docs/DEPLOY-STATUS.md).

**Week 8 — Audit + admin + UAT:** ✓ done
- `/admin/audit` — searchable + filterable audit log (event type / entity / date range / entity-id contains) with collapsible before/after JSON drill-down.
- `/admin/integrations` — Sheets sync state table per tab (last row, last sync, last error), Telegram bot status + paired-user list, "Sync sheets now" button.
- `/admin/teams`, `/admin/users`, `/admin/ad-accounts`, `/admin/routing-rules` — read-only listings (deep CRUD in Phase 1.5).
- `POST /api/leads/[id]/contact` — agent marks first contact, stops the SLA clock, idempotent.
- `POST /api/leads/[id]/assign` — team lead / admin manually reassigns, writes `assignments_history`, resets SLA, fires new-lead notification.
- [`docs/UAT.md`](docs/UAT.md) — 7-scenario verification checklist with copy-paste commands.

**Week 1 — Foundation:** ✓ done
- Next.js 16 + TypeScript + Tailwind v4 scaffolded.
- Drizzle ORM schema for all 17 tables (`src/db/schema/`).
- Supabase Auth wiring + Google SSO login + proxy.ts allowlist.
- Phone / email / loan-type / region / source normalizers + tests.
- Dashboard layout shell with sidebar.

**Week 7 — Real ROAS + Spend CSV:** ✓ done
- Spend CSV parser (`lib/spend/parse.ts`) — header aliases for Meta/Google/TikTok naming variants, date normalization for `M/D/YYYY` without TZ shift (important on UTC+8), Zod validation, per-row error reporting.
- Spend importer (`lib/spend/import.ts`) — resolves ad_account by (platform, external_id), lazily creates campaign/ad_set/ad rows, UPSERTs via `ad_spend_uq` so re-uploads update in place.
- `POST /api/spend/upload` (admin auth) — full per-row report: inserted / updated / skipped / parse_errors.
- `/admin/spend` UI — drop-in upload + last-30-days totals.
- ROAS metrics library (`lib/roas/metrics.ts`) — pure CPL / CPA / approval rate / close rate / Real ROAS with proper null handling.
- Aggregator (`lib/roas/aggregate.ts`) — `topLineMetrics()` for KPIs + `aggregateByDimension()` for 8 breakdowns (platform / brand / campaign / ad_set / ad / source / loan_type / agent).
- `/roas` dashboard — date range (7d/30d/90d) × 8 breakdown dimensions, KPI cards on top + sortable table with color-coded ROAS (green ≥3×, neutral 1-3×, red <1×).
- `/dashboard` overview now shows real today / 7d / 30d KPIs from the aggregator.
- 88/88 tests passing (added 10: spend parse + metrics including the plan's canonical 50 leads / 10 approvals / RM 50,000 / 5× scenario).

**Week 6 — Rejected pool + Agent dashboards:** ✓ done
- Lead detail page `/leads/[id]` — contact / loan / attribution / assignment cards, touchpoints timeline, linked sales records, activity audit, reject action.
- Reject flow (`POST /api/leads/[id]/reject`) — 8 reasons, snapshot copies into `rejected_leads`, releases agent, defaults out_of_coverage / low_quality → resale-only, others → recycle.
- Rejected pool `/rejected` with All / Recycle / Resale tabs, per-reason summary cards, snapshot-based filters.
- Rejected detail `/rejected/[id]` with recycle controls.
- Recycle action (`POST /api/rejected/[id]/recycle`) — creates NEW lead from original snapshot (originals preserved), optional `override_loan_type` reallocation, sets `recycled_at` + `recycled_to_lead_id`, enqueues `lead.route`.
- Mark-resale action (`POST /api/rejected/[id]/mark-resale`).
- CSV export (`GET /api/rejected/export`) — resale-eligible leads with full PII, RFC-4180-quoted.
- Recycle-added Telegram template + notify worker routing.
- Agent stats library (`lib/agents/stats.ts`) — pure metrics (close rate, avg response, SLA compliance, revenue from approved/closed sales only).
- Agents leaderboard `/agents` sorted by revenue + per-agent detail `/agents/[id]` with recent leads.
- 78/78 tests passing (added 7: stats + funnel + duration formatting).

**Week 5 — Sheets sync + Sales matching:** ✓ done
- Google Sheets client (`lib/sheets/client.ts`) — service-account auth from base64 env, `fetchTabValues()` reads `A1:ZZ`.
- Pure parse layer (`lib/sheets/parse.ts`) — header alias map + per-tab `column_mapping` overrides; status synonyms ("Not Suitable"→`not_suitable`); phone/email/amount/date coercion.
- Sync engine (`lib/sheets/sync.ts`) — per-tab cursor (`last_row_synced`), blank-row skip, per-tab error isolation, idempotent re-runs.
- `/api/cron/sheets-sync` (every 2 min via vercel.ts) + `/api/sales/sync` manual admin trigger.
- Sales matching engine (`lib/sales/match.ts`) — L1 exact phone (90d) → L2 exact email → L3 phone last-8; follows dedupe master chain; `fuzzy_multiple` flag when ambiguous.
- `sales.match` worker — links on exact, advances lead status via funnel rules, auto-creates `rejected_leads` row on `rejected`/`not_suitable`, releases agent assignment on rejection.
- Funnel logic (`lib/sales/funnel.ts`) — forward-only status advance with terminal-state handling.
- `/sales` list + `/sales/unmatched` review queue with paste-uuid link form.
- `POST /api/sales/[id]/match` — manual link with the same side-effects as the auto path.
- 71/71 tests passing (added 16: sheet parsing, header mapping, status synonyms, funnel forward-only).

**Week 4 — Routing + Telegram + SLA:** ✓ done
- Routing rule engine (`lib/routing/engine.ts`) — Zod-validated DSL, ops: eq/neq/in/not_in, AND/OR atom groups, priority-ordered first-match-wins.
- Round-robin assigner (`lib/routing/round-robin.ts`) — Redis-tracked cursor per team, daily-capacity skip, fair across 1000 leads on 10 agents (test).
- `lead.route` worker now real — loads rules from DB, picks team via rule, picks agent via round-robin, writes `assignments_history` + audit, enqueues notify.
- Telegram bot (grammy) + `/api/webhooks/telegram` `/start <email>` pairing.
- MarkdownV2 message templates for new lead / VIP lead / SLA breach / routing failure.
- `lead.notify` worker — recipient resolution by notification type (agent DM / team lead DM / HQ admin DM / team group post), `notifications` row written with delivery_status.
- SLA cron `/api/cron/sla-scan` — finds breached leads, marks `sla_breached_at`, enqueues sla_breach. CRON_SECRET bearer auth.
- `vercel.ts` with `@vercel/config` typed config — `sin1` region, cron schedule.
- Audit writer (`lib/audit/write.ts`) — fire-and-forget, never blocks business action.
- Seed script `npm run seed:routing` for the 7 default rules + 7 teams.
- 55/55 tests passing (added: routing engine + round-robin fairness).

**Week 3 — All 4 lead sources live:** ✓ done
- Meta webhook (`GET` verify challenge + `POST` X-Hub-Signature-256). Worker fetches lead detail from Graph API (per-page tokens via env or encrypted on `ad_accounts`).
- Google Ads webhook (POST with `google_key` shared-secret body check, `is_test` suppression, FULL_NAME/PHONE_NUMBER/EMAIL column mapping).
- TikTok webhook (POST with HMAC-SHA256 in `X-Sig` or `X-Tt-Signature`).
- CSV import (`POST /api/ingest/csv` multipart, papaparse, header alias map, per-row Zod validation, idempotent re-upload).
- `/leads/imports` UI for staff CSV drop-in.
- Envelope encryption (`lib/crypto/envelope.ts`) for ad-account access tokens (AES-256-GCM with versioned envelope).
- `lead.ingest` worker now dispatches over all 4 source adapters + Meta Graph fetch.
- 43/43 tests passing (added: Google, TikTok, Meta, CSV, envelope).

**Week 2 — Lead ingest core:** ✓ done
- BullMQ wired to Upstash Redis. Queues: lead.ingest, lead.dedupe, lead.route, lead.notify, audit.write.
- HMAC-SHA256 verification (`src/lib/crypto/hmac.ts`) with timing-safe compare.
- Idempotency guard via `processed_jobs` table (`src/lib/queue/idempotency.ts`).
- Website webhook (`POST /api/ingest/website`): returns 200 always, enqueues raw payload.
- `lead.ingest` worker: Zod adapter → normalize → resolve brand → insert lead → enqueue dedupe.
- `lead.dedupe` worker: L1 exact phone, L2 exact email, L3 fuzzy (first-8 phone + Levenshtein name ≤ 2, manual review).
- `lead.route` worker stub (real engine = Week 4).
- `/leads` list page with graceful DB-unavailable fallback.
- 29/29 unit tests passing (phone, HMAC, Levenshtein).
- Local helpers: `npm run worker`, `npm run seed:brands`, `npm run test:lead`.
- Renamed `middleware.ts` → `proxy.ts` for Next.js 16.

## Setup

1. Copy `.env.example` to `.env.local` and fill in credentials.
2. Create the Supabase project in **ap-southeast-1** (Singapore) for PDPA.
3. Enable extensions:
   ```sql
   -- paste src/db/extensions.sql into Supabase SQL editor
   ```
4. Push schema:
   ```bash
   npm run db:push        # dev (no migration files)
   # or:
   npm run db:generate    # create migration files
   npm run db:migrate
   ```
5. Start dev:
   ```bash
   npm run dev
   ```

## Layout

```
src/
  app/
    (dashboard)/         # auth-gated UI
      layout.tsx
      dashboard/page.tsx
    login/page.tsx
    auth/callback/route.ts
  db/
    schema/              # Drizzle tables, one per file
    client.ts            # postgres.js + drizzle
    extensions.sql       # one-time SQL
  lib/
    env.ts               # Zod-validated env
    normalize/           # phone, email, loan_type, region, source
    supabase/            # browser/server/admin clients
  middleware.ts          # auth gate + email-domain allowlist
```

## Tests

```bash
npm test
```

## Next milestones (per plan)

| Week | Build |
|---|---|
| 2 | Webhook ingest (`/api/ingest/website`) + normalize/dedup workers |
| 3 | Meta / Google / TikTok webhooks + CSV import |
| 4 | Routing rule engine + Telegram bot + SLA cron |
| 5 | Google Sheets sync + sales matching + manual review UI |
| 6 | Rejected pool views + agent performance |
| 7 | Spend CSV upload + Real ROAS dashboard |
| 8 | Audit log UI + admin pages + UAT |

## Blocking inputs needed before Week 5

See plan §20 — brand list, team structure, ad account inventory, sample Google Sheet, Telegram group inventory.
