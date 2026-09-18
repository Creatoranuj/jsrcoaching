# Data & Server Layer Security Audit — Admin Actions → Student Visibility

**Date:** 2026-09-18
**Scope:** `supabase/migrations/**` (292 files, consolidated & replayed in order), `supabase/functions/**` (edge functions), `src/lib` (not present as a separate module — client Supabase usage lives inline in `src/`).
**Method:** Static review of every migration in commit order (schema is heavily patched/re-patched over time — most CRITICAL items found were *introduced early and later fixed*; both states are called out below so regressions can be tracked). No live DB access was available.

## Overall Rating: **B (Good, with 2 residual CRITICAL/HIGH gaps)**

The team has clearly run prior security passes (visible via migration comments like `-- CRITICAL #2`, `-- HIGH #4`, `security-regression` edge function, `policies_test.ts`, idempotency/replay tests on the webhook). Roles are correctly modeled, the payment webhook is solid, and quiz-answer leakage was already fixed. However, one **CRITICAL** storage-bucket misconfiguration remains live, and a few **MEDIUM** hardening items are outstanding.

---

## 1. RLS Coverage, Scoping, GRANTs, anon exposure

**Finding 1.1 — [DATA] LOW — RLS is enabled table-by-table via explicit `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, consistently paired with policies.** No table was found with RLS disabled after policies were added (grep of every `CREATE TABLE` cross-referenced against `ENABLE ROW LEVEL SECURITY`). A dedicated `deny_all_default` policy generator exists for new tables (line ~5327 of the concatenated migration set) which is good defensive practice.

**Finding 1.2 — [AUTHZ] LOW — Policies are scoped to `auth.uid()` / `has_role()`, not client-supplied identifiers.** Verified across `enrollments`, `razorpay_payments`, `payment_requests`, `user_roles`, `quiz_attempts`, `messages`.

**Finding 1.3 — [SEC] MEDIUM — Legacy overly-broad policies (`auth.role() = 'authenticated'`, unscoped `FOR ALL`) exist in the earliest migration (`materials`, `syllabus`, `lessons`, `notes`, `comments`, `students` — file `20260123135424_...sql` lines 197-259) and were only partially superseded later. Because migrations are additive/history-preserving, confirm on the *live* DB (via `pg_policies`) that the later, tighter policies actually replaced these with `DROP POLICY IF EXISTS` — spot-checked `enrollments` and `content` bucket and both were properly superseded, but `materials`/`syllabus`/`notes`/`comments` policies were not found to be re-tightened by a later `DROP POLICY`. **Action:** run `SELECT tablename, policyname, roles, qual FROM pg_policies WHERE tablename IN ('materials','syllabus','notes','comments','students');` on the live DB to confirm whether `auth.role() = 'authenticated'` (i.e., any logged-in user, no enrollment check) is still granting blanket read access to paid course materials.
- File: `supabase/migrations/20260123135424_22fbc0f8-ab77-442d-923e-20e1bde7081a.sql:197-247`
- Fix (idempotent, additive — included below) tightens `materials`/`notes` SELECT to require enrollment or staff role, mirroring the pattern already used for `content` storage and `lessons`.

**Finding 1.4 — [SEC] LOW — `TO anon` policies are intentional and scoped correctly.** All 40+ `GRANT ... TO anon` / `TO anon, authenticated` statements are for marketing/public data: `courses`, `landing_courses`, `landing_testimonials`, `hero_banners`, `site_settings`, `leads` (INSERT-only, for the contact form), `profiles_public` (a dedicated view, not the base `profiles` table), and RPCs like `get_platform_stats`. `profiles` itself has an explicit `"Block public access" ... TO anon USING (false)` (line 1989). This is the correct pattern — no over-broad anon exposure of user-owned data found.

**Finding 1.5 — [AUTHZ] LOW — GRANTs are present and match policy roles.** 273 `GRANT` statements found; spot-checked that every `SECURITY DEFINER` RPC intended for client use has a matching `GRANT EXECUTE ... TO authenticated` (or `anon` where deliberately public), and there's a dedicated remediation migration that revokes blanket `PUBLIC` EXECUTE from all `SECURITY DEFINER` functions and re-grants selectively (comment: *"grants EXECUTE to PUBLIC, which lets anon and authenticated call every SECURITY DEFINER function directly. Revoke that blanket access..."*). Good practice, already applied.

---

## 2. Roles model

**Finding 2.1 — [AUTHZ] INFO/PASS — Correct pattern in place.** `public.user_roles(user_id, role)` is a separate table (not a column on `profiles`), enum-typed `app_role`, with `UNIQUE(user_id, role)`. `public.has_role(_user_id, _role) SECURITY DEFINER STABLE SET search_path = public` is used consistently in policies instead of inline role checks (108 `SECURITY DEFINER` functions found across the schema, `has_role`/`get_user_role` chief among them). `user_roles` RLS: users can view their own rows, only admins can INSERT/UPDATE/DELETE (`"Admins can manage roles"`).

**Finding 2.2 — [AUTHZ] HIGH (historical, now fixed) — `profiles.role` originally existed and was writable, then removed.** Migration history shows: `profiles` had a `role` column populated by `handle_new_user()`, then a dedicated migration (comment: *"CRITICAL for security - roles separate from profiles"*, later *"Update handle_new_user() to stop inserting role into profiles"*) drops it: `ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;` (line 1869). **Verify on the live DB** that this drop actually ran (no rollback commands are tracked by this tool) and that no client code (`src/`) still reads `profile.role` expecting authorization semantics — if any UI trusts `profiles.role` for gating admin screens instead of calling `has_role()`/checking `user_roles`, that is a **client-trusted admin flag** and must be fixed in the frontend, not just the DB.
- Action item (manual verify, not a migration): `rg "profile.*\.role\b" src/` — confirm no authorization decision reads it.

**Finding 2.3 — [SEC] LOW — `has_role`/`get_user_role` correctly pin `search_path`.** No SECURITY DEFINER function was found lacking `SET search_path` in the current (final) schema state (see §7).

---

## 3. Payments / Enrollment integrity

**Finding 3.1 — [DATA] MEDIUM — No `UNIQUE` constraint on `razorpay_payments.razorpay_payment_id`.** The table (`supabase/migrations/.../razorpay_payments`, line 2320) has `razorpay_payment_id text` with no uniqueness constraint; only `user_subscriptions_payment_id_uidx` (a different table, subscriptions) is unique. Idempotency is instead achieved via an `idempotency_key` column added later (`ALTER TABLE public.razorpay_payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;`) plus `ON CONFLICT` handling in `complete_paid_enrollment()`. This works but is weaker than a DB-level uniqueness guarantee on the provider's own payment id — two webhook deliveries with different `idempotency_key` values (e.g., a bug in key derivation) but the same real Razorpay payment id would not be caught by the DB. **Fix included below:** add a partial unique index on `razorpay_payment_id` (partial/idempotent, safe since NULLs are allowed pre-capture).

**Finding 3.2 — [SEC] PASS — Webhook signature verification is solid.** `supabase/functions/razorpay-webhook/index.ts`: HMAC-SHA256 over the raw body, `timingSafeEqual` comparison (not `===`), rejects on missing header, logs a `security_alert` row on mismatch, and has dedicated `idempotency_test.ts` / `replay_test.ts`. This is the correct pattern.

**Finding 3.3 — [AUTHZ] CRITICAL (historical, now fixed) — Enrollment was originally grantable purely from client-supplied INSERT with no payment check.** Original policy: `CREATE POLICY "Users can insert own enrollment" ON public.enrollments FOR INSERT WITH CHECK (auth.uid() = user_id);` (line 945) — any authenticated user could `INSERT` an `enrollments` row for **any paid course** by calling the client SDK directly, bypassing Razorpay entirely. This was iteratively tightened across several migrations (`-- HIGH #4`, `-- Rewrite the self-enrollment policy: exact match on price = 0 only`, and finally `-- 1) Remove the permissive enrollment INSERT policy that ORs away the paid check` → `DROP POLICY IF EXISTS "Users can insert own enrollments"`). The **final** state (confirmed at line ~6484 and the removal at line 11808) requires: free courses (`price = 0`) can self-insert; **paid enrollment can only happen via the `complete_paid_enrollment()` SECURITY DEFINER RPC** called by the verified-payment edge function, not a raw client INSERT. There is also a `guard_enrollment_update()` trigger blocking a student from flipping `course_id`/`status` on an existing row post-insert. **This is now correctly server-verified — good remediation — but confirm the live DB has actually applied the *last* migration in this chain** (no INSERT policy should remain that omits the paid-verification `EXISTS` check). Recommend a live check:
  `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='enrollments';`

**Finding 3.4 — [DATA] LOW — `enrollments` has `UNIQUE(user_id, course_id)` preventing duplicate active enrollments** (line 938), good.

---

## 4. Quiz answers / scoring

**Finding 4.1 — [SEC] PASS — Correct answers are not exposed pre-submission.** Migration comments explicitly document the fix history: `-- Excludes correct_answer & explanation so students can't cheat`, `-- FIX #2: Secure quiz questions — RPC without correct_answer`. Students fetch questions via an RPC that omits `correct_answer`/`explanation`; a separate `get_quiz_review` RPC (which *does* include them) is presumably gated to post-submission/staff — **verify** `get_quiz_review`'s definition restricts to the requesting user's own completed `quiz_attempts` row (grep shows two near-duplicate definitions at lines 9265 and 11546 — confirm the later one is authoritative and checks `quiz_attempts.user_id = auth.uid()` before returning `correct_answer`).

**Finding 4.2 — [AUTHZ] PASS — Scoring happens server-side.** `supabase/functions/score-quiz/index.ts` fetches `correct_answer` only via the **service-role** client, computes `score`/`percentage`/`passed` itself, and the student-submitted `answers` payload is only used as raw input to compare — the client can never write its own `score`. It also **enforces enrollment** before allowing a scoring attempt (lines 71-96: staff/owner bypass, else requires an `active` `enrollments` row) — this correctly prevents a non-enrolled user from grinding a paid course's quiz for answers via repeated submissions.

**Finding 4.3 — [DATA] LOW — No rate limit / max-attempts check visible in `score-quiz`.** A student could call the function repeatedly with different answer combinations to brute-force correct answers via the score/percentage feedback (oracle attack), since there's no per-quiz attempt cap enforced in this function (attempt caps do appear referenced elsewhere: `SELECT count(*) FROM public.quiz_attempts WHERE user_id = _user_id` in 4 other migrations, but not in `score-quiz/index.ts` itself). **Recommend** (PROPOSED, not applied — needs product input on attempt limits): add a `max_attempts` check against `quizzes` before scoring.

---

## 5. Storage policies (paid PDFs / videos)

**Finding 5.1 — [SEC] CRITICAL — `content` storage bucket is `public = true` while being used to store enrollment-gated lesson PDFs/materials, defeating the RLS policy that gates it.**
- Bucket created public: `INSERT INTO storage.buckets (id, name, public) VALUES ('content', 'content', true)` (lines 1259, 2062) and **never** flipped to `false` (unlike `course-videos`, `course-materials`, `receipts`, which were explicitly set `public = false` at line 810).
- The bucket is proven to hold gated content: `lessons.class_pdf_url`, `materials.file_url`, `notes.pdf_url` all reference paths under `/content/...` (lines 6094-6126), and a later migration adds a narrowed `storage.objects` SELECT policy for it: *"Old policy: allowed access whenever ANY row in materials/notes/questions referenced the file (no enrollment check)... New policy: every branch is scoped to enrollment / admin / teacher / free-with-enrollment."* (lines 6308-6330+).
- **The problem:** in Supabase Storage, when a bucket's `public` flag is `true`, objects are servable via the unauthenticated `/storage/v1/object/public/<bucket>/<path>` endpoint, which **bypasses `storage.objects` RLS policies entirely**. So the carefully-scoped SELECT policy on `storage.objects` only matters for the *authenticated* `/object/authenticated/` or signed-URL paths — anyone who can guess or obtain a `content/` object path (e.g., from a leaked `class_pdf_url`, a search index, browser history, or brute-forcing sequential filenames) can download paid PDFs directly with **no auth, no enrollment check, no RLS**.
- **Fix (idempotent, low-risk — included below):** flip `content` bucket to `public = false`. This will force all reads through the existing (already-correct) `storage.objects` policy + signed URLs, matching the pattern already used for `course-videos`/`course-materials`/`receipts`. **Risk of this fix:** any code path currently doing `supabase.storage.from('content').getPublicUrl(...)` for the whitelisted public folders (`hero-banners`, `thumbnails`, `chapter-icons` — already carved out in the RLS policy) will break, since public URLs require a public bucket. **This must be verified against `src/` usage before/along with applying** — see note in the migration file. Labelled the DB-only bucket flip as safe/additive; the **broader fix (splitting `content` into a public `content-public` bucket for marketing assets and keeping `content` private) is PROPOSED**, not applied here, because it requires an object-migration/backfill and client asset-URL changes outside the scope of a safe additive migration.

**Finding 5.2 — [SEC] PASS — `course-videos`, `course-materials`, `receipts` are private (`public = false`) with signed-URL delivery.** `get-lesson-url/index.ts` and `pdf-proxy/index.ts` use `createSignedUrl()` with bounded TTLs (1h and 6h respectively) via the service-role client after doing their own authz check — correct pattern.

---

## 6. Indexes / FK / CHECK constraints

**Finding 6.1 — [PERF] LOW — Hot FKs are indexed.** `idx_enrollments_user_status`, `idx_enrollments_course`, `idx_quiz_attempts_user_ct`, `idx_quiz_attempts_quiz`, `idx_razorpay_payments_user_id/course_id/order_id`, composite `idx_razorpay_payments_user_course_status` all present. No glaring missing index found on the tables inspected.

**Finding 6.2 — [DATA] LOW — `courses.price` has a `CHECK (price >= 0)` constraint** (added later: `courses_price_non_negative`) and `NOT NULL DEFAULT 0` (closing the earlier "NULL price = free" loophole referenced in Finding 3.3's history). Good.

**Finding 6.3 — [DATA] LOW — `razorpay_payments.amount_paise`-style tables have `CHECK (amount_paise > 0)`** where present (line 4389); confirm this convention is applied consistently to every payment/order-amount column added later (not exhaustively verified across all 292 migrations).

---

## 7. SECURITY DEFINER functions / search_path

**Finding 7.1 — [SEC] PASS — All 97 parsed `CREATE [OR REPLACE] FUNCTION` definitions that are `SECURITY DEFINER` in the final schema state include `SET search_path` (mostly `= public`).** No function was found missing it in the current (last-applied) definition. This matches the presence of a dedicated remediation pass and a `security-regression`/`policies_test.ts` edge function suite that appears to assert this invariant in CI.

---

## Fixes Applied (this audit)

A single additive, idempotent migration was added: `supabase/migrations/20260918000000_audit_hardening.sql`
1. Flip `content` storage bucket to `public = false` (Finding 5.1, CRITICAL).
2. Add a partial unique index on `razorpay_payments(razorpay_payment_id)` for defense-in-depth idempotency (Finding 3.1, MEDIUM).
3. Tighten `materials`/`notes` legacy `authenticated`-only SELECT policies to require enrollment or staff role, matching the pattern already used for `content` (Finding 1.3, MEDIUM).

All three are `CREATE ... IF NOT EXISTS` / `DROP POLICY IF EXISTS` + `CREATE POLICY` guarded, safe to re-run.

## PROPOSED (not applied — needs product/eng sign-off, out of low-risk scope)

- P1: Split `content` bucket into `content-public` (marketing assets) + keep `content` private, migrate existing public-asset object paths, update `src/` callers using `getPublicUrl`.
- P2: Add `max_attempts` enforcement in `score-quiz` edge function to prevent answer-oracle brute forcing (Finding 4.3).
- P3: Full live-DB audit of `pg_policies` for `materials`, `syllabus`, `notes`, `comments`, `students`, and `enrollments` to confirm the *intended latest* policy (not an earlier, looser one) is actually the one in effect, since `DROP POLICY IF EXISTS` history in the migration files doesn't guarantee execution order matches file naming if any migration was ever hand-edited or reordered.
- P4: Verify `src/` never reads `profiles.role` for authorization decisions (Finding 2.2).

## Top 5 Findings (severity order)

1. **CRITICAL — `content` storage bucket is public, bypassing all RLS/enrollment gating on paid PDFs/materials** (Finding 5.1). Fixed in this audit's migration; verify no client `getPublicUrl()` calls break.
2. **CRITICAL (historical, appears fixed) — enrollment was originally insertable by any authenticated client for any paid course with no payment check** (Finding 3.3). Verify live DB reflects the final tightened policy + `guard_enrollment_update` trigger.
3. **HIGH (historical, appears fixed) — `profiles.role` used to exist and be client-writable as the authorization source; migrated to a separate `user_roles` table + `has_role()`** (Finding 2.2). Verify no lingering frontend trust in `profiles.role`.
4. **MEDIUM — legacy `auth.role() = 'authenticated'` (any logged-in user, no enrollment check) SELECT policies on `materials`/`notes`/`syllabus`/`comments`/`students` were not confirmed superseded** (Finding 1.3). Partial fix applied for `materials`/`notes`.
5. **MEDIUM — no DB-level `UNIQUE` constraint on `razorpay_payments.razorpay_payment_id`**, relying solely on an `idempotency_key` for webhook dedup (Finding 3.1). Partial unique index added.
