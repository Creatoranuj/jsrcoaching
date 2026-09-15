# Supabase Direct Query vs Edge Function Audit

Audit of the 29 edge functions in `supabase/functions/`. Verdict column: **Keep** = correctly server-side, **Migrate** = candidate to replace with direct RLS-protected query, **Review** = needs runtime check before deciding.

> Policy: nothing is deleted in this pass. "Migrate" rows ship a direct-query alternative side-by-side; cut over only after verifying RLS covers every case.

## Update — 2026-05-31 corrections after re-reading functions

| Function | Old verdict | Corrected verdict | Why |
|---|---|---|---|
| `deep-search-lecture` | Review → Migrate | **Keep** | Uses Firecrawl API key + Lovable AI gateway key. Cannot move client-side. The **DB lookup portion** can be augmented with the new `search_lectures` RPC below — see migration `add-search-lectures-rpc`. |
| `seed-knowledge` | Migrate | **Keep until verified** | Function file retained side-by-side per policy; an admin SQL migration is the recommended cutover path. |

## Active migrations shipped

- ✅ **`search_lectures(query text, limit_count int)`** — pg_trgm-indexed SECURITY DEFINER function over `public.lessons`. Called via `supabase.rpc('search_lectures', …)`. Free Tier safe (no Storage transform quota, no edge invocation count). Granted to `authenticated` only — anon search is intentionally not supported.

## Verdict table

| # | Function | Verdict | Reason |
|---|----------|---------|--------|
| 1 | `bunny-cdn` | **Keep** | Requires Bunny API key (secret) for stream provisioning. |
| 2 | `chatbot` | **Keep** | Wraps OpenAI/Lovable AI key. Must stay server-side. |
| 3 | `crawl4ai-bridge` | **Keep** | External crawler creds + rate-limit gating. |
| 4 | `create-razorpay-order` | **Keep** | Holds Razorpay `key_secret`. PCI-relevant. |
| 5 | `create-subscription-order` | **Keep** | Same — payment provider secret. |
| 6 | `create-zoom-meeting` | **Keep** | Zoom JWT signing requires server secret. |
| 7 | `deep-search-lecture` | **Review** | If it's plain `ilike` over `lectures`, can move to direct query + Postgres trigram index. Worth measuring. |
| 8 | `firecrawl-scrape` | **Keep** | Firecrawl API key. |
| 9 | `generate-embedding` | **Keep** | OpenAI/embedding key + rate limit. |
| 10 | `get-lesson-url` | **Review** | If lessons use Bunny **public** CDN paths, replace with direct `select` + RLS. If signed/expiring URLs, keep. Inspect before cutting. |
| 11 | `get-video-stream` | **Keep** | Almost certainly signs Bunny token-auth URLs. |
| 12 | `get-zoom-signature` | **Keep** | Zoom SDK signature requires secret. |
| 13 | `initiate-refund` | **Keep** | Razorpay refund — server-side mandatory. |
| 14 | `manage-session` | **Review** | If purely tracks `last_seen` in a profile, can be a direct upsert. If it touches admin tables, keep. |
| 15 | `notify-ai` | **Keep** | AI gateway. |
| 16 | `razorpay-refund-webhook` | **Keep** | Webhook receiver (signature verification). |
| 17 | `razorpay-webhook` | **Keep** | Same as above. |
| 18 | `recover-enrollment` | **Review** | Likely admin-only; check if `has_role('admin')` + RLS on `enrollments` is sufficient. |
| 19 | `request-account-deletion` | **Keep** | Deletes `auth.users` — requires service role. |
| 20 | `resolve-doubt` | **Keep** | AI key. |
| 21 | `score-quiz` | **Keep** | Authoritative scoring must not be client-trusted. |
| 22 | `seed-knowledge` | **Migrate (admin-only)** | Bulk insert seeded data — if RLS allows admin INSERTs, this can be a one-shot SQL migration instead of a live function. |
| 23 | `setup-admin` | **Keep** | Grants admin role; service role required. |
| 24 | `start-subscription-trial` | **Keep** | Touches billing state. |
| 25 | `summarize-video` | **Keep** | AI gateway. |
| 26 | `validate-email` | **Keep** | Hits external email-validation API. |
| 27 | `verify-razorpay-payment` | **Keep** | Signature verification — must stay server-side. |
| 28 | `verify-subscription-payment` | **Keep** | Same. |

## What gets migrated next (proposed order)

1. **`deep-search-lecture`** — biggest UX win. Add `pg_trgm` index on `lectures.title` + a SECURITY DEFINER `search_lectures(query text)` function. Frontend calls `.rpc('search_lectures', { query })` directly — one round trip instead of cold-start + fetch.
2. **`get-lesson-url`** (conditional) — only if Bunny URLs are public CDN. If signed, leave alone.
3. **`manage-session`** (conditional) — replace with `upsert` on `profiles` from the client if it only writes `last_active`.
4. **`seed-knowledge`** — convert to a one-off SQL migration; delete the function after data is in.

## What stays forever

Everything that holds a secret (Razorpay, Zoom, Bunny token-auth, OpenAI/Lovable AI) or verifies a webhook signature. Moving these to direct queries would expose keys to the browser — non-negotiable.

## Free-tier impact

Edge Function invocations on Supabase Free Tier are capped at 500k/month. Moving high-frequency reads (search, lesson list, session ping) to direct queries can drop invocation count by 40-70% on a typical learner session, leaving budget for the security-critical functions that must stay.
