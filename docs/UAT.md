# LMIROS Phase 1 — UAT verification checklist

This walks through the 7 acceptance scenarios from the plan. Each step has the exact command(s) to run and the observable result to confirm.

**Pre-conditions** (all of these must be true before starting):
- Supabase project provisioned in `ap-southeast-1`.
- `src/db/extensions.sql` pasted into Supabase SQL editor (citext + pgcrypto + pg_trgm enabled).
- `npm run db:push` succeeded — all 17 tables present.
- `.env.local` populated with real values (drop `LMIROS_DEV_BYPASS_AUTH`).
- `npm run seed:brands` and `npm run seed:routing` ran cleanly.
- At least 1 user row exists with role `sales_agent` and `team_id` set to one of the seeded teams.
- Upstash Redis URL configured.
- `npm run worker` running in a separate terminal.
- `npm run dev` (or production `npm start`) running.

---

## 1. Synthetic webhook → agent Telegram in ≤ 30 s

```bash
npm run test:lead
```

**Expect:**
- HTTP 200 with `{ok: true, idempotency_key: "website:…"}`.
- Within 30 s the lead appears at `/leads` (refresh).
- The assigned agent's chat receives a Telegram DM "🆕 New lead (personal) …".
- Click "Open in LMIROS" → opens the lead detail page.

**If it fails:**
- Check the worker terminal for `[lead.ingest] inserted lead …` and `[lead.route] assigned …`.
- Check `notifications.delivery_status` in the DB.
- Verify `users.telegram_chat_id` is populated for the assigned agent (use `/start <email>` to the bot).

---

## 2. Telegram → Sheet → LMIROS in ≤ 2 min

1. With the lead from §1 still open, have the agent update the Telegram group + Google Sheet:
   - Add a row to the configured sheet with the lead's phone, status = `approved`, sales_amount = `25000`, revenue = `1500`.
2. Wait for the 2-min cron OR click "Sync sheets now" on `/admin/integrations`.

**Expect:**
- A new row in `/sales` with the agent's name and `exact_phone` match badge.
- The lead's status (on `/leads/[id]`) changes from `contacted` → `approved`.
- `/dashboard` Today section approved-sales count increments.

**If unmatched:** check `/sales/unmatched`, paste the lead id, link manually.

---

## 3. ROAS sanity test

1. Build a CSV `spend.csv`:
   ```csv
   platform,ad_account_id,campaign_id,campaign_name,date,spend
   meta,act_REAL_ACCOUNT_ID,c_TEST,May Test,2026-05-26,10000
   ```
2. Upload via `/admin/spend`.
3. Synthesize 50 leads against the `c_TEST` campaign and confirm 10 of them as `approved` with revenue 5000 each (RM 50,000 total) via the sheets sync.

**Expect on `/roas?by=campaign&range=30d`:**
- Row "May Test": leads=50, approved=10, spend=`RM 10,000`, CPL=`RM 200`, CPA=`RM 1,000`, revenue=`RM 50,000`, **Real ROAS = 5.00× (green)**.

---

## 4. Rejected → recycle round-trip

1. Open any active lead. Click "Reject lead" with reason "Wrong loan type".
2. Confirm the lead status flips to `rejected`, agent is released, banner shows "Rejected".
3. Navigate to `/rejected?tab=recycle` — the lead appears with reason `wrong_loan_type`.
4. Click the row → click "Recycle into new lead".
5. Optionally select an `override_loan_type` from the dropdown.

**Expect:**
- A green message "Recycled → <8-char id>…".
- A new lead row created (visible in `/leads`).
- The new lead is routed automatically (Telegram DM to the next round-robin agent).
- On the rejected detail page: `Recycled at` timestamp and link to the new lead.
- Both leads' audit logs show the full chain.

---

## 5. Agent dashboard one-day check

Pick an agent that received ~10 leads today, with 3 approved.

**Expect on `/agents/[id]`:**
- Assigned ≈ 10, Pending visible, Approved = 3.
- Close rate = `30%`.
- Avg response = the actual mean of (`first_contacted_at - assigned_at`) across the 10.
- SLA compliance % matches the fraction not breached.
- Revenue = sum of approved+closed sales revenue.
- Recent leads table shows all 10 ordered newest first.

---

## 6. Permissions check

1. Sign in (incognito) as a `sales_agent` belonging to Team A.
2. Find a lead known to belong to Team B (different `assigned_team_id`).
3. Navigate directly to `/leads/<that-lead-id>`.

**Expect (Phase 1 minimum):**
- 403 on the API for non-self leads when Supabase RLS is enabled.
- Direct page render shows "Database unavailable" rather than the other team's data.
- `/admin/*` routes redirect to `/login?error=domain_not_allowed` for non-admin users (after the email allowlist is in place).

> **NOTE:** Full Supabase RLS policy generation is a Phase 1.5 deliverable. Phase 1 enforces auth in middleware + route handlers; tighten cross-team isolation by adding RLS policies on the `leads`, `sales_records`, `rejected_leads`, `notifications` tables keyed on `auth.uid()` → `users.team_id`.

---

## 7. Audit completeness

Pick any lead that has been through: created → routed → contacted → approved (via sales sync) → rejected → recycled.

**Expect on `/admin/audit?q=<lead-id>`:**
- `lead.assigned` (when first routed)
- `lead.contacted` (when agent marked contacted)
- `sales.matched` (when sheets sync matched)
- `lead.rejected` (when rejected)
- `lead.recycled` (when team lead recycled)

Each entry has an `actor_user_id`, an ISO timestamp, and a clickable JSON before/after payload.

---

## Sign-off

Phase 1 is shippable when **all 7 scenarios pass with real production data for one continuous week** (no rollbacks, no data corruption, no SLA-alert backlog).

| # | Owner | Date passed |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
