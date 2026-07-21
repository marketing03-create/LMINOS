# Search Terms AI — setup & usage

An AI analyst that reads each Google Ads account's real search terms, classifies
every term **KEEP / MONITOR / EXCLUDE**, and recommends safe negative keywords
like an experienced Malaysian personal-loan marketer. Every change is
human-reviewed — nothing is added to Google automatically.

Admin page: **Admin → Search Terms AI** (`/admin/search-terms`).

## What it does

1. **Analyse** — pulls the top actionable search terms (by spend/clicks) for an
   account/campaign from the already-synced `search_terms` data, runs
   deterministic business rules, then asks Claude to classify each term in
   batches. Verdicts land in `search_term_analyses` as `PENDING_REVIEW`.
2. **Review** — filter by decision/status, open a term for the full AI reasoning,
   metrics, and any overlap warning. Approve, reject, or edit the negative
   keyword / match type / level. Bulk approve/reject is supported.
3. **Apply** — for an approved EXCLUDE, "Apply" pushes the negative to Google.
   **Dark by default** (see below): until write access is on it only dry-run
   *validates* the negative against Google and asks you to add it by hand.
4. **Export CSV** — all analyses for an account, for bulk work in Google Ads Editor.

## Two hard safety rules (by design)

- **Apply is DARK** until BOTH Google grants Basic (write) access AND
  `ADS_AUTOMATION_ENABLED=true`. Until then Apply = validate-only, exactly like
  the Account Builder. No negative reaches Google without a human + write access.
- **Search terms are untrusted** (a user can Google an injection string). The
  prompt fences all term data and instructs the model to treat it as data only.

Deterministic guards the AI can't override: **brand protection** (your own brand
names are never excluded) and **min-evidence** (a still-relevant term isn't
excluded on too little data).

## Configuration

Environment (all optional; reuses the existing AI + write gates):

| Var | Default | Purpose |
|---|---|---|
| `AI_GATEWAY_API_KEY` | — | Vercel AI Gateway key. **Required** to analyse. |
| `SEARCH_TERMS_MODEL` | `anthropic/claude-sonnet-5` | Model for classification (fast + cheap for bulk; set opus to override). |
| `SEARCH_TERMS_MAX_TERMS` | `300` | Max terms one run pulls (keeps it inside 300s). |
| `ADS_AUTOMATION_ENABLED` | unset | `true` + Google Basic access = live apply. |

Per-account business rules (page → **Settings**): own brand/product names,
competitor strategy (exclude/monitor/allow), services not offered, supported /
unsupported locations, and the min-clicks / min-cost evidence thresholds. Nothing
is hardcoded — the analyzer only knows what's saved here (defaults are used if
unset).

## Data model

- `search_term_analyses` — one row per analysed term (decision, recommendation,
  suggested negative, risk, review state, apply outcome). The AI's original
  `suggested*` fields are never overwritten; reviewer edits go to `edited*`.
- `campaign_analysis_settings` — the per-account (optionally per-campaign)
  configurable rules above.

Migration: `0027_shallow_pretty_boy.sql` (additive — 7 enums + 2 tables). Apply
with `npm run db:migrate` before first use.

## Scope (v1)

In: classification + negative recommendations + review/edit/bulk + dry-run apply +
overlap check + CSV. Campaign-level negatives only (search-term data has campaign
but not ad-group). Deferred: ad-group/shared-list negatives, positive-keyword /
new-ad-group opportunities, root-phrase grouping, background-job queue.
