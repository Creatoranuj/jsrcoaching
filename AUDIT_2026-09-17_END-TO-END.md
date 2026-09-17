# End-to-End Deep Audit — JSR Coaching (2026-09-17)

**Scope:** poora repo `Creatoranuj/jsrcoaching` @ `4930bb4` — 702 ts/tsx files, 44 edge functions, 290 migrations, Android/Capacitor shell, live DB (wegamscqtvqhxowlskfm), live site (jsrcoaching.vercel.app).
**Method:** 12 parallel audit lanes (architecture, performance, mobile view, touch feel, Supabase backend, CI/E2E, crash-shield, console triage, red-team, assets, Capacitor/video, error tracking) + live-state checks (DB queries, linter, CORS probe, browser sweep). Har bada finding code me dobara verify kiya gaya hai.

## Overall Rating: 3.5 / 5

**Verdict:** App engineering-level par strong hai (payments, auth, RLS, back-button, PDF streaming sab pehle se hardened), lekin **paid video content abhi bina token ke publicly embed ho raha hai** (CRITICAL), kuch student-facing screens mobile par genuinely tooti hui hain (28px tabs, 3-col grids 360px par), aur ek 935KB ka PDF-export chunk bundle me hai. Ask-a-Doubt aaj bhi live nahi — server purana CORS origin bhej raha hai (neehe "Blocker").

---

## CRITICAL (turant fix hone chahiye)

### C1. Paid video bina token ke public iframe par chal raha hai — Bunny Stream Token Auth missing
**Where:** `src/components/video/BunnyStreamPlayer.tsx:14-50`
**Evidence (verified):** Player `https://player.mediadelivery.net/embed/<libraryId>/<videoId>` iframe embed use karta hai. Poore repo me `m3u8`, `hls`, signed-URL ya token-expiry code **zero hits**; koi edge function `mediadelivery` ko reference bhi nahi karta. Matlab video URL DB se seedha client tak jaata hai — agar Bunny library par "Token Authentication" off hai (repo me uska koi saboot nahi), to jiske paas videoId hai (DB leak, shared link, student DevTools) woh paid lecture bina login, bina expiry ke chala sakta hai. Watermark/anti-piracy kaam sirf YouTube path par hai, Bunny path par nahi.
**Why it matters:** Paid course piracy — poore app ka revenue surface.
**Fix:** (a) Bunny dashboard par library-level Token Authentication on karein, (b) ek edge function jo short-lived signed embed URL mint kare (jaise `get-lesson-url` signed PDF URLs deta hai), (c) client us signed URL ko use kare. Ya Bunny direct HLS + hls.js per-request signed manifest.
**Pehle verify:** Bunny dashboard → library → Token Authentication on hai ya nahi.

### C2. ~30 routes ke paas koi ErrorBoundary nahi — ek error poora app unmount kar deta hai
**Where:** `src/App.tsx:308-432`
**Evidence (verified):** Sirf 5 routes (Dashboard, MyCourseDetail, LessonView, QuizAttempt, LiveClass) ke paas local `<ErrorBoundary>` hai. Baaki sab (Courses, BuyCourse, PaymentCallback, QuizResult, saare 20 admin pages, Community, Reports…) root boundary par girti hain — jo AuthProvider/BatchProvider/Router sab unmount karta hai, aur transient-error regex par chupke se `window.location.reload()` kar deta hai (flaky network par reload loop).
**Fix:** Chhota `withRouteBoundary(Component, title)` helper bana kar poore route table par ek pass me lagayein — Dashboard/QuizAttempt jaisa hi pattern.

### C3. Mobile par Tabs primitive 28px ka hai — har tabs surface 44px minimum se chhota
**Where:** `src/components/ui/tabs.tsx:63` — `h-7 text-sm` (verified)
**Why:** TabsTrigger Course, Library, AllLive, LiveClass (live class ke chat/Q&A/notes switcher — one-handed use!), TeacherLiveView, AdminCMS, QuizResult sab jagah reuse hota hai. Dozens of taps 28px par.
**Related (same family):** `AdminChatbotSettings.tsx:428` — 5-col tab grid 360px par garble; `Reports.tsx:173,198` aur `QuizResult.tsx:567` — `grid-cols-3` bina breakpoint, 360px par labels wrap/jam; `Dashboard.tsx:396` — `grid-cols-3` quick actions.
**Fix:** Trigger `h-11`/`min-h-[44px]`; 3-col grids → `grid-cols-2 sm:grid-cols-3`; 5-col tabs → horizontal scroll strip (`flex overflow-x-auto no-scrollbar`).

---

## HIGH

### H1. ContentDrillDown me asli N+1 — har chapter ke liye alag query
**Where:** `src/components/admin/ContentDrillDown.tsx:167-172` (verified — `for…await` loop per chapter)
**Why:** 30 chapters = 30 serial round-trips = 3-9s spinner, aur `chapters` badalne par dobara.
**Fix:** Ek grouped query: `.in("chapter_id", ids)` se saare lessons ki chapter_id fetch karke client-side count, ya ek `GROUP BY` RPC.

### H2. PDF scroll handler har scroll tick par React re-render
**Where:** `FastPdfReader.tsx:1012-1019` (aur `PdfViewerWithAutoScroll.tsx:88`)
**Why:** `setReadProgress` bina throttle 30-60x/sec — 100-page PDF par 60fps scroll ka requirement tootta hai.
**Fix:** `requestAnimationFrame` throttle.

### H3. `html2pdf.js` 935KB chunk bundle graph me
**Where:** build output `dist/assets/html2pdf-*.js` = 935KB raw; `vendor-sentry` 475KB, `vendor-pdf` 419KB, `vendor-charts` 405KB.
**Fix:** html2pdf ko click-handler ke andar dynamic `import()` karo ya server-side PDF render par le jao; `vendor-sentry` me Replay/Profiling integration strip karo (target <60KB gzip); CI me gzip-size gate lagao (`reportCompressedSize:false` ki wajah se koi measure hi nahi kar raha).

### H4. AdminRoute stale-role escape hatch
**Where:** `src/App.tsx:309-310` (verified)
**Why:** 6s timeout ke baad client-cached `isAdmin` se admin UI render ho jaata hai — role revoke hone par bhi UI dikhta reh sakta hai (data nahi — har edge function server-side role check karta hai, verified).
**Fix:** Render ke liye explicit `isAdmin === true` required karo, stale cache par kabhi nahi.

### H5. Fire-and-forget fetches bina `.catch` — spinner hamesha ke liye atak jaata hai
**Where:** `AdminUpload.tsx:252,265,280,284`, `TimetableManager.tsx:32` (`.then` bina catch), `LessonView.tsx:744`, `useLessonFeatureFlags.ts:136`.
**Why:** Hard network reject (`Failed to fetch`) par koi error nahi dikhta, loading state atki rehti hai. `AbortController` bhi nahi (sirf `cancelled` flag) — abandoned requests stack hote hain.
**Fix:** Har jagah `.catch(err => logger.error(...); setLoading(false))` + `.abortSignal()`.

### H6. CI smoke test asli me kuch test nahi karta
**Where:** `maestro/smoke.yaml:59-166` — login-submit aur bottom-nav taps tak sab `optional: true`. Login fail ho tab bhi test "green".
**Fix:** Critical-path steps se `optional: true` hatao.
**Related CI:** Playwright config me 7 projects par CI sirf chromium install/run karta hai (`playwright.config.ts:42,46` vs `playwright-e2e.yml:72`); `build-apk.yml:117,134,146,377` bash-syntax (`[[`, `local`) bina `shell: bash`; `maestro-android.yml:132` me `emulator-boot-timeout` missing; E2E specs missing-secrets par chupke skip hoti hain (`test.skip(!EMAIL…)`).

### H7. Video background me chalta rehta hai
**Where:** `BunnyStreamPlayer.tsx:136-146` sirf `visibilitychange` (OEM WebViews par unreliable); `MahimaGhostPlayer.tsx` me background-pause **bilkul nahi**.
**Why:** Home dabao → paid video + audio background me streaming, battery drain, Play Store review risk.
**Fix:** Dono players me `App.addListener('appStateChange', …)` → `pauseVideo()`.

### H8. Rate limiter AI endpoints par fail-open hai
**Where:** `supabase/functions/_shared/rateLimit.ts:22-38` (verified — "Fails open on RPC error" documented)
**Why:** RPC down hone par `resolve-doubt`/`chatbot` unlimited chalega = LLM cost abuse. Payments wale functions sahi tarike se fail-closed hain (`verify-razorpay-payment` 503 deta hai) — inconsistency hi khatra hai. `recover-enrollment` me bhi yahi gap (`recover-enrollment/index.ts` rlError par aage badhta hai).
**Fix:** AI/cost-sensitive buckets ke liye fail-closed karo (503), low-cost buckets ke liye fail-open theek hai.

### H9. Database: quizzes ke authors apni drafts nahi dekh sakte + 3 missing hot-path indexes
**Where (live DB se verified):**
- `quizzes` policies me koi `created_by = auth.uid()` SELECT nahi — teacher apna unpublished quiz nahi dekh/edit kar sakta. Fix: `CREATE POLICY "Creators view own quizzes" ON public.quizzes FOR SELECT TO authenticated USING (created_by = auth.uid());`
- Missing: `messages(session_id, created_at)`, `lessons(chapter_id, sort_order)`, `chapters(course_id, sort_order)` — verified in-memory index list me sirf pkey/single-col hain.
- **Correction pichhle audit se:** `enrollments(user_id, course_id)` aur `lesson_progress(user_id, lesson_id)` unique indexes **pehle se maujood hain** — pehli report ka "zero indexes" claim galat tha.

### H10. 29 jagah `text-[10px]`/`text-[11px]` real content par
**Where:** `MyCourses.tsx:125,150,165,196,220,265`, `QuizResult.tsx:438-799` (12 jagah), `Community.tsx:363`, `Messages.tsx:549`, `MyCourseDetail.tsx:895,1099,1196`, `Students.tsx:178,181`.
**Why:** 14px body floor se neeche — batch name, progress %, score labels readable nahi.
**Fix:** Decorative → `text-xs`, decision-critical → `text-sm`. Naya `text-[10/11px]` kabhi nahi.

### H11. Migration me mara hua default URL — force-update users dead link par
**Where:** `supabase/migrations/20260519155657_*.sql:6-7` — `android_store_url`/`ios_store_url` DEFAULT `https://naveenbharat.vercel.app/install` (retired domain). Baad wala migration sahi default karta hai, par column default purana hai — kisi din re-seed hua to users hard-lockout.
**Fix:** Follow-up migration jo column default ko `https://jsrcoaching.vercel.app/install` kare.

---

## MEDIUM (is hafte)

- **M1 [SEC]** `verify-phone-otp` par khud koi rate limit nahi (sirf send par hai) — OTP brute-force cross-phone. Fix: verify par bhi 10/15min phone-keyed limit.
- **M2 [SEC]** Android par `FLAG_SECURE` paid screens par call-site se verify nahi hua — `useScreenProtection(active)` ka invocation har paid video/PDF route par confirm karo (red-team ne call sites nahi dhoondhe; agar kahin missing hai to screen-record aasaan).
- **M3 [SEC]** Smoke-test login-autofill code release APK ke source me shipped hai (`MainActivity.java:232-266`, gated by `SMOKE_TEST_BUILD`) — release variant se sourceSets se poora hatao, sirf flag-gate par bharosa mat karo.
- **M4 [CRASH]** `MahimaGhostPlayer.tsx:714` — iframe `message` listener me `JSON.parse` bina try/catch; koi bhi non-JSON postMessage throw karega. Fix: try/catch + early return.
- **M5 [CRASH]** `Map.get(x)!` non-null assertions user-data par: `Students.tsx:84`, `Doubts.tsx:559` (deleted parent reply par crash), `AdminTrustedHosts.tsx:130`, `UsersSection.tsx:145`. Guard: `const p = map.get(k); if (p) p.children.push(node)`.
- **M6 [CRASH]** Landing page crash risk: `Testimonials.tsx:70`, `TestimonialsManager.tsx:200`, `Course.tsx:283`, `StudentAttendanceRow.tsx:23` — `name.charAt(0)` bina null-guard. `null` name wali row landing page tod degi. Fix: `(name || "?").charAt(0)`.
- **M7 [OBS]** 44 edge functions me error tracking nahi — sirf `console.error` Supabase logs me, koi request-id correlation nahi. `_shared/errors.ts` me Sentry capture ya `error_logs` table insert add karo (`error_logs`/`audit_log` tables khali padi hain — koi code unme likhta hi nahi).
- **M8 [OBS]** ~120 silent `catch {}` — critical ones: `App.tsx:43`, `ErrorBoundary.tsx:38,45,49,97,100`, `ForceUpdateGate.tsx:27,39,47`, `DocumentReader.tsx:141,172,397,433`. Kam-se-kam root/init paths par `logger.error` lagao.
- **M9 [ASSETS]** Install-time payload ~7.4MB vs 3MB budget — `public/pdfjs/*` 4.5MB (worker 2.19MB). pdfjs ko CDN par ya route-lazy karo; `src/assets/landing/*.jpg` delete karo jahan `.avif` already hai (hero-classroom.jpg 165KB, study-materials.jpg 149KB); branding duplicates (`jsr-mark.webp` vs `nb-mark.webp` dono jagah) ek karo; `success.mp3` 0 bytes ka hai.
- **M10 [ASSETS]** LCP image lazy hai: `Hero.tsx` Picture par `priority` nahi, `index.html` preload nahi — landing ka sabse bada image sabse baad me aata hai. Fix: `fetchpriority="high"` + preload; `jsr-mark.webp` ka unused preload hatano (live console warning confirmed).
- **M11 [SEC]** Blanket `USING (true)` policies 50+ tables par, kuch bina `TO` scoping — catalog tables ke liye theek, par column add hone par silently expose. Public views (`*_public`) pattern ko extend karo. (Live DB check: `profiles` ka purana "viewable by everyone" policy **ab live nahi hai** — pehle se fixed; `phone_otps` RLS-on + no-policy + no-grant = sahi design.)
- **M12 [UX]** Admin ke inline delete buttons `h-3 w-3` icons bina wrapper (`ContentDrillDown.tsx:1075,1372`) — 30px se chhota hit area.
- **M13 [MOTION]** Arbitrary durations: `SeekBar.tsx:194` (260ms), `PdfViewer.tsx:302` (250ms), `MyCourses.tsx:143` (600ms), `MahimaGhostPlayer.tsx:1135,1139` (750ms) — token scale (150/200/300) me lao.
- **M14 [CAP]** Fullscreen back-sentinel logic 3 player files me duplicate hai instead of shared `useOverlayHistorySentinel` hook — regression risk naye overlays ke liye. Orientation lock bhi ref-counted nahi (fast lesson-switch par stuck-landscape possible).
- **M15 [CI]** `signed-apk-smoke.yml:791` download-artifact bina run-id/token; CI me `npx cap sync android` chala kar `capacitor.plugins.json` drift check karo (plugin silently no-op ho sakta hai).
- **M16 [A11Y]** `select.tsx:20` trigger `text-sm` — Android zoom-on-focus. `text-base md:text-sm` karo.
- **M17 [PERF]** 78 `<img>` bina `loading="lazy"`, 77 bina width/height (Header/Sidebar global chrome included → CLS har page par). Runtime Storage URLs par CDN resize params (`?width=200&format=webp`) lagao — vite-imagetools runtime URLs ko cover nahi karta.

## LOW (backlog)

- 201 `any`-casts (`ContentDrillDown`, `Admin`, `AdminAnalytics` top culprits).
- God components: `LessonView.tsx` (1170+ lines), `ContentDrillDown.tsx` (1300+).
- `key={index}` editable lists par: `SyllabusManager.tsx:139`, `AskDoubtSheet.tsx:297`, `Dashboard.tsx:296`, `AdminAnalytics.tsx:478`.
- `Doubts.tsx:115,156` `user!.id` assertions — explicit `if (!user)` guard.
- Edge me dead code: `verify-phone-otp/index.ts:106-113` listUsers results discarded.
- Stale comments: `SplashHider.tsx:11` "1.5s" vs actual 800ms.
- Live site: `/about`, `/contact` soft-404 (hash navigation hai, standalone routes nahi) — `Navigate` redirects add karo.
- `JetBrains Mono` (31KB) global preload par sirf admin/debug use — admin layout me move karo.
- Docs me purane `com.safarenglishka.app` strings — historic, koi runtime impact nahi.

---

## Blocker (audit se theek nahi hoga — aapka action chahiye)

**Ask-a-Doubt aaj bhi live nahi.** Aaj (2026-09-17 03:10 UTC) live probe: `ai-health`, `resolve-doubt`, `chatbot` — teeno par `access-control-allow-origin: https://safarenglishka.vercel.app` (purana origin). Fix ke liye: **Supabase Dashboard → Edge Functions → Secrets me `ALLOWED_ORIGINS` = `https://jsrcoaching.vercel.app`** (2 minute), ya Supabase access token de dein to main khud deploy kar dunga.

## Linter snapshot (live)

- 27 issues: 1 INFO (RLS-no-policy: `phone_otps` — intended, service-role only), 25 WARN (SECURITY DEFINER functions `authenticated`/`anon` se executable — zyadatar intended student RPCs hain, par `anon_write_grants()` jaise admin diagnostics public executable hain — `REVOKE EXECUTE` karo), 1 WARN: **Leaked password protection disabled** — Supabase Auth settings me on karein (1 click).
- DB verifications jo reports ke davor sahi nikle: `profiles` permissive policy pehle se hata hui; `enrollments`/`lesson_progress` composites maujood; saare SECURITY DEFINER functions me `search_path` set hai (0 exceptions).

## Wins (jo pehle se sahi hai — dobara na todein)

- **CORS hardening exemplary**: allow-list + echo-only-known-origins + `X-Origin-Known` header, inline incident history.
- **Payments bulletproof**: HMAC timing-safe, server-side price derivation, webhook replay protection, cross-user ownership re-checks, fail-closed rate limits.
- **RLS on saare 76 tables**, roles sirf `user_roles` me, `has_role()` se check.
- **PDF streaming architecture sahi**: `disableAutoFetch:false`, `disableStream:false`, 64KB range chunks, IntersectionObserver page-mount — 100MB PDF bhi OOM nahi hoga.
- **Back button single-mount singleton** (StrictMode-proof), splash hide 800ms, plugins lazy + try/catch, cleartext off, scoped permissions, WebView debugging off in prod.
- **Sentry wired** frontend par PII scrubbing ke saath (emails, +91 numbers, JWTs), ProGuard mappings CI se upload.
- **Realtime hygiene**: 16/16 channels me `removeChannel` cleanup — zero leaks.
- **Safe-area handling** Header/BottomNav/sticky bars par genuinely achhi (keyboard-height composition included).
- 702 tests, tsc clean, vite build pass.

## Fix Plan

1. **Abhi (is sprint):** C1 (Bunny token auth — pehle dashboard verify), C3 (tabs h-11 + grid fixes), H8 (rate limit fail-closed), H11 (store URL default migration), linter ka leaked-password protection on karna.
2. **Is hafte:** C2 (route boundaries), H1-H5, H7 (background pause), H9 (quizzes policy + 3 indexes), H10 (micro-type), M4-M6 (crash guards), M16.
3. **Next sprint:** H3 (bundle diet + gzip gate), H6 (CI real gate), M1-M3, M7-M15, M17.
4. **Backlog:** LOW section + god-component splits + `any` cleanup.

## Unverified / could not verify

- Bunny library par Token Authentication on hai ya off (repo se nahi hota — dashboard check karna hoga).
- Live `ALLOWED_ORIGINS`, `RAZORPAY_WEBHOOK_SECRET`, `ADMIN_PASSWORD` values (secrets hain, repo me nahi — sahi hai).
- Live DB par latest storage policies applied hain ya nahi (`20260730051738` ke baad) — production schema vs migrations HEAD drift check pending.
- `useScreenProtection` har paid route par call hota hai ya nahi (M2).
- 3 unthrottled scroll handlers (`NotesPanel`, `PageIndicatorPill`, `useKeyboardInset`) individually audit nahi hue.
