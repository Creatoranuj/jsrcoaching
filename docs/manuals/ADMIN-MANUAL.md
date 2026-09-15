# Safar English — Admin Manual

> Hinglish + English · v1.0 · 2026-07-19
> Audience: admins & teachers. Student flow ke liye pehle [`USER-MANUAL.md`](./USER-MANUAL.md) padhiye.

---

## Table of Contents

1. Roles & Access
2. Admin Dashboard Tour
3. Content Management (CMS)
4. Quiz Manager
5. Uploads (Video / PDF / Image / Notion)
6. Payments (Razorpay + Manual)
7. Fraud Watch ⭐
8. Users
9. Student Drill-Down
10. Moderation
11. Analytics ⭐
12. Live Class Management
13. Doubts Moderation
14. Chatbot Admin
15. Notices & Push
16. Marketing (Campaigns, Funnels, Leads, Banners)
17. Security Dashboard
18. Edge Functions Map
19. Database & RLS Overview
20. Deployment & Releases
21. Monitoring & Incident Response
22. FAQ + Glossary

---

## 1. Roles & Access

Roles table: `public.user_roles` (never `profiles.role`). Enum `app_role`:

| Role | Kya kar sakta |
| --- | --- |
| `admin` | Sab kuch — payments, users, CMS, analytics, fraud |
| `teacher` | Courses/lessons/quiz manage, attendance, live |
| `student` | Default — learning only |

### 1.1 Login
- Admin login: `/admin/login` (email + password).
- Register (first-time only): `/admin/register` — bootstrap protected by env secret.

### 1.2 Role assign
Supabase SQL editor me:
```sql
INSERT INTO public.user_roles(user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'x@y.com';
```

### 1.3 Route gate
All `/admin/*` routes wrapped in `<AdminRoute>` — server-side `has_role()` check + client redirect.

---

## 2. Admin Dashboard Tour (`/admin`)

Cards / quick actions:

| Card | Route | Kaam |
| --- | --- | --- |
| CMS | `/admin/cms` | Courses, chapters, lessons |
| Upload | `/admin/upload` | Bulk upload center |
| Study Materials | `/admin/study-materials` | PDFs, books |
| Schedule | `/admin/schedule` | Lecture schedule |
| Quiz | `/admin/quiz` | Quiz manager |
| Live | `/admin/live` | Zoom live classes |
| Chatbot | `/admin/chatbot` | FAQ + settings |
| Analytics | `/admin/analytics` | KPIs |
| Trusted Hosts | `/admin/trusted-hosts` | Whitelist |
| Security | `/admin/security` | Scan results |
| Users | `/admin/users` | Search / block |
| Moderation | `/admin/moderation` | Reports |
| Fraud Watch | `/admin/fraud-watch` | Bypass detection |

---

## 3. Content Management (`/admin/cms`)

### 3.1 Courses
- Create: title, description, thumbnail, price (₹), grade, exam-track, faculty, validity.
- Publish / Unpublish toggle.
- Order (sort) drag-drop.

### 3.2 Chapters
- Chapter code (e.g. `CH-01`), title, subject.
- Reorder — order student side me reflect hota hai.

### 3.3 Lessons
- Type: `video`, `PDF`, `NOTES`, `DPP`, `TEST`.
- Video source: **Bunny.net library id + video id** (preferred) ya **YouTube URL**.
- Duration, is_free (preview), publish date.
- Attachments (see §3.4).

### 3.4 Lesson attachments
Har lesson ke andar aap add kar sakte ho:
- PDF / Notes / DPP (Supabase storage upload ya external URL)
- Notion page URL (published) — see §5.4
- Quiz link (from Quiz Manager)

### 3.5 Study materials (`/admin/study-materials`)
Course-independent PDFs / books — student side `/materials`, `/books` par dikhte hain.

### 3.6 Landing / Banners
- Hero banners, testimonials, landing courses — `landing_*` tables.
- Edit through CMS panel; go live instantly.

---

## 4. Quiz Manager (`/admin/quiz`)

### 4.1 Create quiz
- Title, subject, course link, duration (min), pass %, negative marks.
- Publish toggle.

### 4.2 Questions
- Text + optional image.
- 4 options; mark correct (index).
- Optional explanation (shown in review).

### 4.3 Secure review flow
- Student jab quiz submit karta hai, `score-quiz` edge function server-side scoring karta hai.
- Review page `get_quiz_review(_attempt_id)` **SECURITY DEFINER** RPC call karta hai — correct answers sirf attempt owner ko dikhti hain, aur woh bhi post-submit.
- Client me correct answers kabhi expose nahi hoti.

### 4.4 Import / Export
CSV import (question, option1..4, correct_index, explanation). Export same format.

---

## 5. Uploads (`/admin/upload`)

### 5.1 Video (Bunny)
- Bunny library me upload karo (dashboard ya API).
- Video id copy → lesson me paste. Streaming automatically.

### 5.2 PDF
Two modes:
- **Public bucket** — chhote free PDFs.
- **Proxy** (`pdf-proxy` edge function) — paid content, auth check + signed URL.

### 5.3 Image
Supabase storage bucket `content-images`; auto-thumbnail generation.

### 5.4 Notion page attachment
- Notion page ko **publish to web** karo (Share → Publish).
- Public URL copy karo (e.g. `https://foo.notion.site/Page-abc123`).
- Lesson attachment me "Notion" type → URL paste.
- Backend `notion-page` edge function (public, `verify_jwt = false`) unfurl karta hai.
- Agar 401 aaye → page still private hai, publish check karo.

---

## 6. Payments

### 6.1 Razorpay auto-flow
```
student → BuyCourse → create-razorpay-order → Razorpay checkout
       ↓ success
       verify-razorpay-payment (signature + amount check)
       ↓
       enrollments row auto-inserted → course unlocked
       ↓
       razorpay-webhook (async reconciliation)
```

### 6.2 Manual payment requests
Table: `payment_requests`. Admin dashboard me approve/reject.
- Approve → enrollment insert + student ko email/push.
- Reject → reason note + refund if paid.

### 6.3 Refund
- `initiate-refund` edge function → Razorpay refund API.
- Webhook `razorpay-refund-webhook` status update karta hai.
- Enrollment revoke manual (Fraud Watch se ya SQL).

### 6.4 Amount mismatch
Backend `verify-razorpay-payment` order amount vs paid amount check karta hai. Mismatch = enrollment nahi banta, event `payment_events` me log hota hai.

---

## 7. Fraud Watch (`/admin/fraud-watch`) ⭐

RPC `admin_get_suspicious_enrollments` — 6 detection rules run karta hai:

| # | Rule | Severity |
| --- | --- | --- |
| 1 | Enrollment exists but NO payment row | **Critical** |
| 2 | Duplicate `razorpay_order_id` across users | **Critical** |
| 3 | Paid amount ≠ course price | **High** |
| 4 | Payment failed but enrollment granted | **High** |
| 5 | Enrollment created outside typical flow (no order id) | Medium |
| 6 | Same user, N enrollments in < 60 s | Medium |

### 7.1 Actions
| Button | Kya hota hai |
| --- | --- |
| **Revoke** | `admin_revoke_enrollment` → enrollment delete, `audit_log` entry |
| **Mark Legit** | Flag me `legit=true` — future scans me skip |
| **Block User** | `admin_set_user_block` → `profiles.is_blocked=true` → login block |

### 7.2 Audit
Har action `audit_log` me — actor, target, reason, timestamp.

### 7.3 Indexes
`razorpay_payments(razorpay_order_id)`, `enrollments(user_id, course_id)` — scans ~50 ms.

---

## 8. Users (`/admin/users`)

- Search by name / email / mobile.
- Columns: name, email, role, batches, joined, last_seen, blocked.
- Actions: Block / Unblock, View detail, Assign role.

`admin_set_user_block(user_id, blocked bool, reason text)` — trigger `auth.users.banned_until` bhi update karta hai taaki JWT refresh block ho.

---

## 9. Student Drill-Down (`/admin/users/:userId`)

Ek screen par saara profile:
- Personal info
- **Batches / enrollments** (course, purchase date, amount, source)
- **Payments** (all Razorpay + manual)
- **Attendance** (live class %)
- **Quiz history** (score, time)
- **Doubts** (open/answered)
- **Sessions** (active devices, IP, user-agent)
- **Push tokens**
- Danger: Block, Force-logout, Delete request approve

---

## 10. Moderation (`/admin/moderation`)

Table: `content_reports`.
- Reported posts / comments queue.
- Actions: **Hide** (`is_hidden=true`), **Delete**, **Warn user**, **Ban user**.
- Repeat offender counter — 3 strikes se auto-block suggestion.

---

## 11. Analytics (`/admin/analytics`) ⭐

### 11.1 Live KPIs
- **DAU / WAU / MAU** — `user_sessions` unique users.
- **Signups trend** — last 30 days line chart.
- **Revenue** — Razorpay success payments sum.
- **Course-wise sales** — top 10.

### 11.2 GitHub APK downloads
`https://api.github.com/repos/<owner>/<repo>/releases` — per-release download count.

### 11.3 Retention
D1 / D7 / D30 cohort chart.

### 11.4 Platform stats
`platform-stats` edge function aggregates — cached 5 min.

---

## 12. Live Class Management (`/admin/live`)

- Schedule: title, subject, start time, duration, host (teacher).
- Zoom meeting create — `create-zoom-meeting` function.
- Signature generate — `get-zoom-signature`.
- Attendance auto-recorded via `live_participants`.
- Recording upload back to lesson (optional).

---

## 13. Doubts Moderation

- Doubts queue (see `/doubts` admin filter).
- Assign to teacher.
- Reply (text + image).
- AI-suggested draft via `resolve-doubt` (edit before send).
- Mark resolved.

---

## 14. Chatbot Admin (`/admin/chatbot`)

- **FAQ** (`chatbot_faq`) — question / answer pairs, priority.
- **Settings** (`chatbot_settings`) — system prompt, model, rate limit, greeting.
- **Logs** (`chatbot_logs`) — user, session, message, response, tokens.
- **Feedback** (`chatbot_feedback`) — 👍/👎 with reason; use to improve prompt.

### 14.1 AI Gateway
Backend Lovable AI Gateway use karta hai (`LOVABLE_API_KEY`). Enabled at project level.

---

## 15. Notices & Push

### 15.1 Notices (`/notices` admin view)
- Broadcast title + body → all students / batch-filtered.
- Pin important notices.

### 15.2 Push
- `push_tokens` table stores FCM tokens.
- `notify-ai` function broadcasts.
- Test push from Analytics → Push debug.

---

## 16. Marketing

| Feature | Table | Kaam |
| --- | --- | --- |
| Campaigns | `marketing_campaigns` | Email / push blast |
| Funnels | `funnel_stages`, `funnel_entries` | Conversion tracking |
| Leads | `leads` | Landing form submissions |
| Meta Ads | `meta_ad_config` | Pixel / conversion API config |
| Hero banners | `hero_banners` | Home page carousel |
| Landing content | `landing_content`, `landing_courses`, `landing_testimonials` | Public landing edits |
| Earning links | `earning_links` | Affiliate / referral |

---

## 17. Security Dashboard (`/admin/security`)

### 17.1 Scan results
In-app scanner findings — severity + fix suggestion.

### 17.2 Manual toggles (Supabase dashboard)
Ye admin ko khud enable karna hoga:

| Setting | Where | Why |
| --- | --- | --- |
| Leaked password protection | Auth → Providers → Email | HaveIBeenPwned check |
| Postgres upgrade | Settings → Infrastructure | Security patches |
| MFA for admin users | Auth → Providers | Add TOTP |

### 17.3 Edge function secrets
Set via Lovable secrets tool (never in code):
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

> **Test vs live keys — kaha set karna hai (important)**
>
> | Kaha | Kya control karta hai |
> | --- | --- |
> | **Supabase secrets** (`RAZORPAY_KEY_ID` / `_SECRET` / `_WEBHOOK_SECRET`) | **Asli app.** APK, web, preview — sab yahi key use karte hain. `create-razorpay-order` edge function hi client ko `key_id` bhejta hai. |
> | **GitHub Actions secrets** (same names) | Sirf `razorpay-smoke.yml` nightly CI probe. App par **koi asar nahi**. Live key yahan kabhi mat daalo — workflow `rzp_test_` prefix na hone par fail ho jata hai. |
>
> `.github/workflows/build-apk.yml` me Razorpay ka koi variable nahi hai aur
> React bundle me bhi key hardcode nahi hoti — isliye APK workflow me test key
> daalne se app test mode me **nahi** jaata. App ko test mode me le jaane ke
> liye Supabase secret badlo. Test mode active hone par checkout header par
> laal **TEST MODE** badge dikhta hai (order response ka `mode` field).

- `BUNNY_API_KEY`, `BUNNY_LIBRARY_ID`
- `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`
- `LOVABLE_API_KEY` (AI Gateway)
- `NOTION_TOKEN` (optional; public pages ke liye nahi chahiye)

---

## 18. Edge Functions Map

| Function | Auth | Purpose |
| --- | --- | --- |
| `create-razorpay-order` | JWT | Order create for course |
| `verify-razorpay-payment` | JWT | Signature + amount check, enroll |
| `razorpay-webhook` | Signature | Async reconciliation |
| `create-subscription-order` | JWT | Subscription orders |
| `verify-subscription-payment` | JWT | Subscription verify |
| `start-subscription-trial` | JWT | Free trial |
| `initiate-refund` | Admin JWT | Refund Razorpay call |
| `razorpay-refund-webhook` | Signature | Refund status |
| `get-lesson-url` | JWT (getClaims) | Signed video URL |
| `get-video-stream` | JWT | Bunny signed URL |
| `pdf-proxy` | JWT | Streamed protected PDFs |
| `resolve-storage-pdf` | JWT | Supabase storage → signed URL |
| `notion-page` | Public | Notion published page fetch |
| `bunny-cdn` | JWT | Bunny purge/sign |
| `create-zoom-meeting` | Admin | Zoom API |
| `get-zoom-signature` | JWT | Zoom SDK sig |
| `score-quiz` | JWT | Server-side quiz scoring |
| `chatbot` | JWT | AI chat (Lovable AI Gateway) |
| `resolve-doubt` | JWT | AI doubt draft |
| `summarize-video` | JWT | Smart notes |
| `generate-embedding` | Admin | Vector embeddings |
| `deep-search-lecture` | JWT | Semantic search |
| `seed-knowledge` | Admin | KB ingest |
| `crawl4ai-bridge` / `firecrawl-scrape` | Admin | Web crawl |
| `manage-session` | JWT (getClaims) | Session revoke/list |
| `send-phone-otp` / `verify-phone-otp` | Public | Phone login |
| `request-account-deletion` | Public | GDPR |
| `platform-stats` | JWT | Analytics cache |
| `dependency-scan` | Admin | Package CVEs |
| `security-regression` | Admin | Sec tests |
| `setup-admin` | Bootstrap | First admin |
| `self-enroll-free` | JWT | Free courses enroll |
| `recover-enrollment` | JWT | Re-grant lost |
| `import-banner-image` | Admin | Banner CDN import |
| `content-redirect` | Public | Short-link redirect |
| `validate-email` | Public | Email disposable check |

---

## 19. Database & RLS Overview

### 19.1 Key tables (~85 total)
- **Auth-linked**: `profiles`, `user_roles`, `user_preferences`, `user_sessions`, `push_tokens`
- **Content**: `courses`, `chapters`, `lessons`, `lesson_pdfs`, `lesson_attachments`, `lecture_notes`, `lecture_schedules`, `study_materials`, `books`, `syllabus`
- **Learning**: `enrollments`, `lesson_progress`, `lesson_bookmarks`, `lesson_likes`, `lesson_ratings`, `attendance`, `notes`, `smart_notes`, `student_notes`
- **Quiz**: `quizzes`, `questions`, `quiz_attempts`
- **Live**: `live_sessions`, `live_participants`, `live_messages`, `live_reminders`
- **Doubts**: `doubts`, `doubt_replies`, `doubt_sessions`
- **Community**: `community_posts`, `community_comments`, `community_reactions`, `content_reports`
- **Payments**: `razorpay_payments`, `payment_requests`, `payment_events`, `subscription_plans`, `user_subscriptions`
- **Marketing**: `marketing_campaigns`, `funnel_*`, `leads`, `hero_banners`, `landing_*`, `earning_links`, `meta_ad_config`
- **Chatbot**: `chatbot_faq`, `chatbot_logs`, `chatbot_feedback`, `chatbot_settings`, `knowledge_base`
- **Ops**: `audit_log`, `error_logs`, `security_alerts`, `security_events`, `rate_limits`, `webhook_events`, `crawl_history`, `pdf_proxy_metrics`, `dependency_scan_reports`, `app_config`, `site_settings`, `trusted_hosts`

### 19.2 RLS pattern
- Har table par RLS enabled.
- `has_role(auth.uid(), 'admin')` SECURITY DEFINER function admin checks ke liye — recursion avoid.
- User-scoped policies `auth.uid() = user_id`.
- `service_role` bypass — sirf edge functions use karti hain.

### 19.3 Grants rule
Har `CREATE TABLE public.<x>` ke saath `GRANT` mandatory (else PostgREST 401). See `docs/audit/*` for full grants matrix.

---

## 20. Deployment & Releases

### 20.1 Web
- Framework: React 18 + Vite 5 + TS 5 + Tailwind 3.
- Host: Vercel / Netlify (SPA + `_redirects`).
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- Build: `bun run build` → `dist/`.

### 20.2 Android APK
- Capacitor wrapper (`android/`).
- Build: `scripts/build-apk-local.sh` ya GitHub Actions (`.github/workflows/maestro-android.yml`).
- Release: GitHub Releases → `/install` page pulls latest.
- What's-new: `distribution/whatsnew/whatsnew-en-US`.

### 20.3 Play Store
- AAB build → internal testing → production.
- `docs/STORE-READINESS.md` checklist.

### 20.4 Versioning
- `src/utils/version.ts` — semantic (e.g. `1.0.18`).
- CHANGELOG.md maintain manually.

---

## 21. Monitoring & Incident Response

### 21.1 Sentry
- Web + Android DSN — errors, performance.
- Triage docs: `docs/observer/2026-07-*sentry-triage*.md`.

### 21.2 Uptime
- `pdf-proxy-keepalive.yml` — keeps proxy warm.
- `supabase-keepalive.yml` — DB ping.

### 21.3 Backups
- Supabase daily PITR (7 days) — dashboard se restore.
- Storage buckets: versioning ON.

### 21.4 Incident playbook
1. **Payment down** → Razorpay dashboard status, check `razorpay-webhook` logs, notify students via notice.
2. **AI down** → Lovable AI Gateway status, chatbot me graceful fallback already shipped.
3. **DB slow** → `supabase--slow_queries`, add index, restart pooler.
4. **Fraud spike** → Fraud Watch check, block source, notify Razorpay.

---

## 22. FAQ + Glossary

### FAQ

**Q. Naya admin kaise banayein?**
A. §1.2 SQL run karo — user pehle signup kar chuka ho.

**Q. Free trial de sakte hain?**
A. Haan — `start-subscription-trial` function. Course-level "is_free" preview lessons alag hain.

**Q. Bulk students import?**
A. CSV upload feature abhi CMS me nahi — SQL insert into `profiles` + `enrollments` recommended, ya raise feature request.

**Q. Ek payment do baar count ho gaya**
A. Fraud Watch rule #2 pakdega — Revoke duplicate, refund initiate.

**Q. Video download hone se kaise rokein?**
A. Bunny DRM enable karo + `get-video-stream` short-TTL signed URLs (default 5 min).

### Glossary

| Term | Matlab |
| --- | --- |
| RLS | Row-Level Security |
| RPC | Remote Procedure Call (Supabase function) |
| SECURITY DEFINER | Function owner ke privileges se run |
| PostgREST | Supabase auto-REST layer |
| Bunny | Bunny.net CDN + Stream |
| 3DS | 3D-Secure card auth |
| PWA | Progressive Web App |
| AAB | Android App Bundle |
| DAU/MAU | Daily / Monthly Active Users |

---

*End of Admin Manual · Update this doc whenever a new admin route or edge function ships.*