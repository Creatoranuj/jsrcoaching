# Safar English — Feature Checklist Tracker

**Date:** 2026-07-13  
**Release target:** v1.0.17  
**Audit lens:** senior-architect-audit (engineering + design)  
**Legend:** ✅ Pass · ⚠️ Partial / backlog · ❌ Fail · — N/A

---

## 1. Learning Content

| # | Feature | Was (before recent sprints) | Now (current state) | Known Error / Gap | Status |
|---|---|---|---|---|---|
| 1 | **DPP (Daily Practice Problems)** | Single PDF, no attachments drawer | Unified notes drawer + `PdfSelectPopup` bottom-sheet with PDF-thumb icons | None | ✅ |
| 2 | **Notes PDF** | Loaded via legacy public URL, leaky | `storage://lecture-pdfs` + signed URLs, LRU cache (32) | 33rd lesson evicts earliest (accepted) | ✅ |
| 3 | **Class PDF (`class_pdf_url`)** | Duplicated when auto-linked in `lesson_pdfs` | De-duped by URL in `useLessonNotes` | None | ✅ |
| 4 | **Lesson Attachments** | Public bucket | Private `lesson-attachments` + on-demand signed URLs | None | ✅ |
| 5 | **PDF Viewer (FastPdfReader / NotionPageRenderer)** | Blob leaks on unmount | Cleanup effects verified (MED-1 closed) | None | ✅ |
| 6 | **PDF Select Popup** | Center dialog, generic external-link icon | Bottom-sheet, PDF thumb, Download button, haptic | None | ✅ |
| 7 | **Video Player (MahimaGhostPlayer)** | Immersive drift on rotate | Rotation-aware, immersive sync intact | None | ✅ |
| 8 | **Video Watermark** | Static | Rolling user-id watermark | None | ✅ |
| 9 | **Live Class (YouTube + Zoom)** | — | Wired via `AdminLiveManager` | None | ✅ |
| 10 | **Lecture Listing / Chapter View** | Unvirtualized | Still unvirtualized (backlog) | Jank on 200+ lessons | ⚠️ |

---

## 2. AI & Chatbot

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 11 | **Safar Sarthi (chatbot)** | Sadguru Sarthi branding | Rebranded, RAG-powered | None | ✅ |
| 12 | **Ask Doubt (in-lesson)** | Single teacher | Round-robin: Raj VIP, Safar Agent, English Sarthi, Sahayak | None | ✅ |
| 13 | **Safar Agent / resolve-doubt edge fn** | 429/402 not surfaced | Toast with credit/rate messages | None | ✅ |
| 14 | **ChatWidget attachments** | Blob URL leaked whole session | `useEffect` cleanup revokes on unmount / change | None | ✅ |
| 15 | **Firecrawl (admin)** | Edge fn orphaned | Wired in `AdminChatbotSettings` + haptic | None | ✅ |
| 16 | **Embeddings backfill (admin)** | Edge fn orphaned | Wired + haptic | None | ✅ |
| 17 | **Regenerate last answer** | — | Available in `useLessonChat` | None | ✅ |

---

## 3. Quiz / Assessment

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 18 | **Quiz Engine** | Timer + palette | Same, stable | None | ✅ |
| 19 | **Quiz Answers Security** | `questions` table read | `questions_for_students` view (answers stripped) | None | ✅ |
| 20 | **QuizResult / Reports** | Long unvirtualized list | `react-window` virtualized attempts | None | ✅ |
| 21 | **Mark-for-review, palette nav** | — | Live | None | ✅ |

---

## 4. Payments & Enrollment

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 22 | **Razorpay** | Client-trusted | Webhook-first enrollment | None | ✅ |
| 23 | **Manual UPI fallback** | — | Live | None | ✅ |
| 24 | **Stripe** | Not configured | Config pending | Optional | ⚠️ |
| 25 | **Enrollment bypass tests** | — | `enrollment-bypass.yml` CI | None | ✅ |

---

## 5. Auth & Roles

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 26 | **Session** | Persistent + refresh | Same; instant login | None | ✅ |
| 27 | **User roles** | — | `user_roles` + `has_role()` SECURITY DEFINER | None | ✅ |
| 28 | **Admin role for shomarnashaurya@…** | Duplicate `student` row | Cleaned; only `admin` remains | None | ✅ |
| 29 | **Phone / Forgot / Reset flows** | — | Live | None | ✅ |

---

## 6. Screen Protection

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 30 | **FLAG_SECURE (Android)** | All users blocked | Blocked for students, **bypassed for admin** via `useScreenProtection` | None | ✅ |
| 31 | **Admin bypass source** | — | Role-based (`AuthContext.isAdmin`), not email — spoof-safe | None | ✅ |
| 32 | **Real-time toggle on role change** | — | `useEffect([isAdmin])` re-applies instantly | None | ✅ |

---

## 7. Lists & Performance

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 33 | **Messages (contacts)** | Unvirtualized | `react-window` | None | ✅ |
| 34 | **EnrollmentManager** | Unvirtualized | `react-window` | None | ✅ |
| 35 | **Reports (quiz attempts)** | Unvirtualized | `react-window` | None | ✅ |
| 36 | **Downloads / Community / LessonList** | Unvirtualized | Still unvirtualized | Variable-height, needs `@tanstack/react-virtual` | ⚠️ |
| 37 | **queryPersister** | No size cap | Bounded | None | ✅ |
| 38 | **crashShield** | — | Active + Sentry breadcrumbs | None | ✅ |

---

## 8. Capacitor / Mobile

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 39 | **Back button** | Multiple listeners | Single `App` listener + singleton guard | None | ✅ |
| 40 | **Keyboard / safe-area insets** | — | Handled | None | ✅ |
| 41 | **Splash screen** | — | JS-side timeout safety | None | ✅ |
| 42 | **Immersive mode + visibilitychange** | — | Live; ordering risk between `useBackgroundPresence` & `installImmersiveAutoToggle` if either throws | Low-risk, no fix | ⚠️ |
| 43 | **Haptics (`soft-touch`)** | Missing on new admin buttons | Added on Firecrawl + Backfill | None | ✅ |
| 44 | **Deep linking / assetlinks.json** | — | Live | None | ✅ |
| 45 | **APK build (bun + GH Actions)** | — | `build-apk.yml` green; version guard untested on throwaway tag | Test-tag skipped by user | ⚠️ |

---

## 9. Admin Console

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 46 | **AdminCMS (courses/chapters/lessons)** | Live | Live | None | ✅ |
| 47 | **AdminChatbotSettings** | Firecrawl/Embeddings orphaned | Wired + haptic | None | ✅ |
| 48 | **AdminAnalytics / Reports** | Live | Live | None | ✅ |
| 49 | **AdminSecurity / TrustedHosts** | Live | Live | None | ✅ |
| 50 | **AdminLiveManager / Schedule** | Live | Live | None | ✅ |

---

## 10. Community, Downloads, Misc

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 51 | **Community feed** | Unvirtualized | Same | Backlog | ⚠️ |
| 52 | **Downloads (offline)** | Live | Live | List not virtualized | ⚠️ |
| 53 | **Doubts page** | Live | Live | None | ✅ |
| 54 | **Notices / Timetable / Syllabus / Attendance** | Live | Live | None | ✅ |
| 55 | **Books / Library / Materials** | Live | Live + screen-protected | None | ✅ |
| 56 | **PlayerTest.tsx** | Debug leftover | Backlog cleanup | Non-blocking | ⚠️ |

---

## 11. Backend / CI

| # | Feature | Was | Now | Error / Gap | Status |
|---|---|---|---|---|---|
| 57 | **Supabase RLS** | Live | Live; linter clean of new regressions | Pre-existing linter debt | ⚠️ |
| 58 | **Edge functions** | 5 orphaned | 2 wired (Firecrawl, Embeddings); audit script added | 3 still orphan (backlog) | ⚠️ |
| 59 | **GitHub Actions** | build/e2e/maestro/lighthouse | All green | Play auto-publish needs `PLAY_SERVICE_ACCOUNT_JSON` | ⚠️ |
| 60 | **Sentry** | Live | Live; `crashShield.recovered` breadcrumb pending | Backlog LOW | ⚠️ |

---

## Ship Verdict — v1.0.17

🟢 **Green.** Zero CRITICAL / HIGH across 11 skills. Only backlog items (list virtualization for 3 pages, throwaway tag verification, Play auto-publish secret, Sentry breadcrumb polish) remain — none block release.

Used the senior-architect-audit skill.
