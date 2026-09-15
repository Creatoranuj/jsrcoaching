# Observer Report — 2026-07-08 — Undone Work Checklist + Long-Run Recommendations

**Window observed:** last 4 sessions (payment BAD_REQUEST fix → red-team audit → landing rebrand → now)
**Skill:** history-observer
**Rating:** 4/5 — shipped work is solid, but backlog is growing faster than it's being closed.

---

## 1. Undone / Slipped Tasks (carry-over)

### 🔴 High priority — carried from 2+ sessions
- [ ] **Playwright regression for Razorpay `BAD_REQUEST_ERROR`** — stub `capacitor-razorpay` to throw `{code:"BAD_REQUEST_ERROR", step:"payment_authentication"}`, assert friendly toast + spinner resets. Promised twice, never written.
- [ ] **Supabase linter — 109 pre-existing WARN entries** — public-bucket listing on 3 buckets (`avatars`, `comment-images`, `book-covers`) + GraphQL anon exposure. Needs `supabase-architect-auditor` decision (accept vs fix).
- [ ] **Full 25-vector red-team PoC walk** — only scanner snapshot ran; no manual exploitation attempted (auth bypass, IDOR, webhook forgery, deep-link hijack, WebView escape).

### 🟡 Medium — implied but not verified
- [ ] **Migration for `site_settings.telegram_url` / `youtube_url`** — inserted but never confirmed the `SocialLinks` component actually reads those keys (may still render defaults).
- [ ] **`recover-enrollment` edge function** — mentioned in payment fix as safety net, never confirmed deployed or tested end-to-end.
- [ ] **Webhook idempotency check** for the new `BAD_REQUEST_ERROR` code path — `webhook_events` insert-before-side-effect not verified for failure branch.
- [ ] **Console-error-triage sweep** — noise level on `/buy/:courseId` after the razorpay changes never re-measured.

### 🟢 Low — nice-to-have from earlier promises
- [ ] `CommunityStrip` A/B copy (currently "Free lessons, daily updates, doubt help" — no variants tested).
- [ ] Haptic on Footer social icons (only added on `CommunityStrip` CTAs).
- [ ] Telegram/YouTube link in **BuyCourse success screen** — highest-intent moment, currently missing.
- [ ] Telegram/YouTube link in **empty state** of `MyCourses` (student with 0 enrollments = perfect funnel to Telegram).

---

## 2. Skills invoked vs skills promised

You listed 27 skills across the last 3 messages. Actually applied:

| Skill | Used? | Evidence |
| --- | --- | --- |
| red-team-security-audit | ✅ partial | scanner snapshot only, no PoC |
| history-observer | ✅ | 2 prior reports + this one |
| senior-architect-audit | ✅ | payment fix commentary |
| razorpay-payments | ✅ | BuyCourse + razorpay(Native).ts |
| app-crash-shield | ✅ | finally-guard on spinner |
| console-error-triage | ⚠️ mentioned, not measured |
| soft-touch | ❌ Wave A planned, not shipped |
| supabase-architect-auditor | ❌ 109 warns still open |
| mobile-view-Expert | ❌ no viewport pass done |
| safe-area-handling | ❌ not touched this window |
| capacitor-back-button | ❌ not touched |
| capacitor-video-player-master | ❌ not touched |
| asset-optimization | ❌ landing images not audited |
| debugging-capacitor | ❌ no APK smoke test |
| capacitor-deeplink (batch enrolment) | ❌ **never implemented** |
| capacitor-bun-apk-build | ❌ no build attempted |
| tailwind-capacitor | ❌ |
| webapp-to-capacitor / framework-to-capacitor | N/A |

**Gap:** 12 of 18 relevant skills were name-dropped but not executed.

---

## 3. Recommendations for Next Work (long-run, ordered)

### Sprint 1 — Close the payment loop (1 session)
1. Write the Playwright regression for `BAD_REQUEST_ERROR` (blocker for confidence).
2. Verify `recover-enrollment` edge function is deployed; add e2e: pay → kill callback tab → next login shows enrolled.
3. Add Telegram/YouTube CTAs to `PaymentCallback` success screen + `MyCourses` empty state.

### Sprint 2 — Supabase hygiene (1 session, `supabase-architect-auditor`)
4. Triage all 109 linter WARN — mark each as `accept` (update `security-memory`) or `fix` (migration).
5. Verify `site_settings` seed keys match what `SocialLinks.tsx` reads.
6. Add `audit_log` entry for every new SECURITY DEFINER function added recently.

### Sprint 3 — Red-team PoC pass (1 session, `red-team-security-audit`)
7. Manually attempt 5 highest-risk vectors: (a) IDOR on `enrollments`, (b) webhook HMAC bypass, (c) deep-link intent hijack, (d) storage upload without ownership scope, (e) role escalation via profile update.
8. File findings via `manage_security_finding`, update security memory.

### Sprint 4 — Capacitor mobile pass (1 session)
9. `capacitor-bun-apk-build` → build APK, run `scripts/logs-android.sh` during: cold start, buy course, back-button chain, keyboard on LeadForm.
10. `safe-area-handling` + `mobile-view-Expert` — audit CommunityStrip + Footer at 360×640 and notch devices.
11. `capacitor-back-button` — verify no double-listener regression after landing changes.
12. `capacitor-deeplink` — implement batch enrolment deep link (`safarenglishka://enroll/:batchId`) — still fully undone.

### Sprint 5 — Polish (`soft-touch` + `asset-optimization`)
13. Optimize landing hero/community images (WebP + width hints).
14. Ship soft-touch Wave A (micro-animations, haptic consistency).
15. Console-error-triage final sweep across 6 canonical routes.

---

## 4. Long-run health metrics to watch

| Metric | Current | Target |
| --- | --- | --- |
| Supabase linter CRITICAL/HIGH | 0 | 0 |
| Supabase linter WARN | 109 | < 20 |
| Sentry `console.error` volume | unknown | measure baseline |
| APK cold start | unmeasured this window | < 3s |
| Payment success → enrollment latency | unmeasured | < 5s p95 |
| Playwright coverage of paid flow | 0 tests | 1 happy + 1 error |

---

## 5. Wins this window (don't lose them)
- ✅ Payment `BAD_REQUEST_ERROR` no longer freezes UI.
- ✅ 7/7 security scanners clean.
- ✅ Landing has real social funnel (3 touchpoints).
- ✅ `rel="noopener noreferrer"` everywhere (vector #12 safe).

---

**Next action suggested:** start Sprint 1 — write the Playwright regression + verify `recover-enrollment`. Say "start sprint 1" to proceed.
