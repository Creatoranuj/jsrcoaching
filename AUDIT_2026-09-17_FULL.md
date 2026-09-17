# JSR Coaching — Full Deep Audit + Fix Report (2026-09-17)

Nine parallel audits were run over the whole repo (crash safety, console/error
triage, small-screen layout, touch UX, senior architecture, Supabase
architecture, red-team security, performance, plus a manual four-area sweep).
This file is the permanent record; earlier per-agent reports lived only in a
scratch directory and were lost.

Verification for this round: `tsc --noEmit` clean, `vitest run` 702 passed /
6 skipped, `vite build` succeeds.

---

## 1. Critical

### 1.1 Ask-a-Doubt fails for every student (CORS)
Deployed edge functions answer preflight with
`access-control-allow-origin: https://safarenglishka.vercel.app`, the previous
project's domain. The browser therefore blocks every call from
`jsrcoaching.vercel.app`, and the student only sees
"Failed to send a request to the Edge Function".

Repo-side fix (commit 033c89f + this commit): `supabase/functions/_shared/cors.ts`
echoes the caller's origin **only when it matches the allow-list**
(`jsrcoaching.vercel.app`, `jsrcoaching-*` previews, `*.jsrcoaching.com`,
localhost, Capacitor origins) and otherwise falls back to the canonical
origin. Unknown websites no longer receive a permissive header.

**Still open — not fixable from inside this repo:** the functions must be
redeployed, or `ALLOWED_ORIGINS=https://jsrcoaching.vercel.app` set in
Supabase → Edge Functions → Secrets. Until then the live site stays broken.

---

## 2. High — fixed in this commit

| # | Issue | File | Fix |
|---|-------|------|-----|
| 2.1 | Blank/whitespace-only profile name crashed the avatar (`name.split(" ")[1][0]` on undefined) | `src/components/profile/ProfileAvatar.tsx` | initials computed from filtered parts, falls back to `"U"` |
| 2.2 | Admin analytics silently capped at Supabase's 1000-row limit, so DAU, course completion, quiz rates and the leaderboard were wrong on real data | `src/pages/AdminAnalytics.tsx`, new `src/lib/fetchAllRows.ts` | all four queries paginate via `fetchAllRows` (1000/page, 50-page cap); failures logged and surfaced with a toast instead of showing zeros |
| 2.3 | Book reordering issued one sequential UPDATE per book (N+1) and swallowed failures, so a partial reorder looked successful | `src/hooks/useBooks.ts` | updates run in parallel, first error rethrown, destructive toast on failure |
| 2.4 | `admin-register` had no throttle at all — the admin code could be brute-forced at network speed | `supabase/functions/admin-register/index.ts`, `supabase/functions/_shared/rateLimit.ts` | new `isRateLimitedByKey` (backed by `check_rate_limit_text`); 5 attempts per IP per 15 minutes → 429 |
| 2.5 | Timetable manager: failed course load left an empty dropdown with no message; a throw during save left the button spinning forever | `src/components/admin/TimetableManager.tsx` | error branch on the course fetch, `try/finally` around create, error toast on delete |
| 2.6 | Admin icon buttons were 24–28px — below the 44px touch guidance, hard to hit on a phone | `src/components/admin/ContentDrillDown.tsx`, `src/components/admin/AdminLessonAttachments.tsx` | 36px on mobile, original compact size from `sm:` up (20 buttons) |

---

## 3. Findings checked and dismissed

- **"Duplicate realtime channel names (LiveBadge / AllLive)"** — false alarm.
  Channels are `live-badge-watch` and `all-live-watch`; distinct.
- **"Ramchandra Sir" still present** — zero matches. Persona now comes from
  `src/config/faculty.ts` and `supabase/functions/_shared/persona.ts`.
- **Remaining `safarenglishka` strings are deliberate and must not change:**
  - `verify-phone-otp/index.ts` — internal proxy-email format for phone login;
    changing it locks out every existing phone user.
  - `pdf-proxy/index.ts` — `storage-safarenglishka-recording`, a separate live
    storage project that still serves recordings and PDFs.
  - Historical `*.md` audit/doc files.

---

## 4. Confirmed healthy

Android back-button handling; no secrets in client code; Razorpay webhook
signature verification; WebView hardening; DOMPurify on rendered HTML;
realtime channel cleanup on unmount; route-level lazy loading and manual
vendor chunking; WebP assets.

---

## 5. Remaining backlog

1. **Redeploy edge functions / set `ALLOWED_ORIGINS`** (owner action) — the one
   thing standing between these fixes and a working Ask-a-Doubt.
2. Live end-to-end proof: post a real doubt and capture
   "Pankaj Sir is typing…" plus the AI answer.
3. Migrate the remaining functions to the shared AI helper: `notify-ai`,
   `ai-health`, `summarize-video`, `deep-search-lecture`, `generate-embedding`.
4. Small-text labels (`text-[10px]`/`text-[11px]`) on QuizResult and MyCourses —
   cosmetic, readable but tight.
5. Lesson card third variant test hook; browser test selector/timeout fixes.
6. `.github/workflows/deploy-functions.yml` — blocked by the connection's
   missing `workflow` write scope.
