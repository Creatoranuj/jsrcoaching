# Phase 2 — Content Wipe (Courses, Chapters, Lessons & saara uploaded content)

> ⚠️ **Ye destructive hai.** Chalane se pehle Supabase Dashboard → Database → Backups
> se ek manual backup / PITR point bana lo. Ek baar delete hone ke baad wapas nahi aata.
>
> Lovable ka cloud tool abhi galat (khaali) project se juda hua hai, isliye ye SQL
> **manually** chalana hoga: Supabase Dashboard → **SQL Editor** → New query → paste → Run.

Project: `xvlvrbpqxqqqaeihofod`

---

## Kya delete hoga

| Rakha jayega | Delete hoga |
| --- | --- |
| `profiles`, `students`, `user_roles`, `auth.users` (students/admin accounts) | `courses`, `chapters`, `lessons`, `materials`, `study_materials`, `books` |
| `app_config`, `site_settings`, `landing_*`, `hero_banners` (branding/landing) | `enrollments`, `lesson_progress`, `user_progress`, `quiz_attempts` |
| `subscription_plans` (price plans) | `quizzes`, `questions`, `lesson_pdfs`, `lesson_attachments`, `notes`, `lecture_notes`, `smart_notes`, `student_notes` |
| `chatbot_settings`, `knowledge_base` | `lesson_ratings`, `lesson_likes`, `lesson_bookmarks`, `comments`, `doubt_sessions`, `doubt_replies` |
| | `live_sessions`, `live_messages`, `live_participants`, `live_reminders`, `lecture_schedules`, `timetable`, `syllabus`, `attendance` |
| | Storage: `content`, `course-videos`, `lecture-pdfs` |

Payments (`razorpay_payments`, `payment_requests`, `receipts`) **default me nahi hatate** —
financial record hai. Agar hatana hai to niche Step 4 uncomment karo.

---

## Step 1 — Pehle count dekh lo (safe, read-only)

```sql
select 'courses' t, count(*) from public.courses
union all select 'chapters', count(*) from public.chapters
union all select 'lessons', count(*) from public.lessons
union all select 'enrollments', count(*) from public.enrollments
union all select 'quizzes', count(*) from public.quizzes
union all select 'materials', count(*) from public.materials
union all select 'live_sessions', count(*) from public.live_sessions
order by 1;
```

## Step 2 — Child rows (FK order me, upar se niche)

```sql
begin;

-- progress / engagement
delete from public.lesson_progress;
delete from public.user_progress;
delete from public.lesson_ratings;
delete from public.lesson_likes;
delete from public.lesson_bookmarks;
delete from public.comments;

-- notes
delete from public.lecture_notes;
delete from public.smart_notes;
delete from public.student_notes;
delete from public.notes;

-- lesson attachments / pdfs
delete from public.lesson_attachments;
delete from public.lesson_pdfs;

-- quizzes
delete from public.quiz_attempts;
delete from public.questions;
delete from public.quizzes;

-- doubts
delete from public.doubt_replies;
delete from public.doubt_sessions;

-- live classes / schedule
delete from public.live_messages;
delete from public.live_participants;
delete from public.live_reminders;
delete from public.live_sessions;
delete from public.lecture_schedules;
delete from public.attendance;
delete from public.timetable;
delete from public.syllabus;

commit;
```

## Step 3 — Core content

```sql
begin;

delete from public.enrollments;
delete from public.materials;
delete from public.study_materials;
delete from public.content;
delete from public.books;

delete from public.lessons;
delete from public.chapters;
delete from public.courses;

-- landing page par jo courses dikhte hain
delete from public.landing_courses;

commit;
```

## Step 4 — (OPTIONAL) Payments bhi hatane hain to

```sql
-- begin;
-- delete from public.receipts;
-- delete from public.razorpay_payments;
-- delete from public.payment_requests;
-- delete from public.user_subscriptions;
-- commit;
```

## Step 5 — Verify

Step 1 wali query dobara chalao — sab counts `0` hone chahiye.

---

## Step 6 — Storage files hatao

DB rows delete karne se storage ke files apne aap nahi hatte. Ye script chalao:

```bash
export SUPABASE_URL="https://xvlvrbpqxqqqaeihofod.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key — Dashboard → Settings → API>"

# pehle dry run (kuch delete nahi hoga, sirf list dikhega)
node scripts/wipe-storage.mjs

# confirm hone ke baad
node scripts/wipe-storage.mjs --yes
```

Buckets jo saaf honge: `content`, `course-videos`, `lecture-pdfs`.
`avatars`, `receipts`, `chat-attachments` ko ye script haath nahi lagati.

> Service role key kabhi commit mat karna — sirf apne terminal me export karo.

---

## Step 7 — App check

- Landing page → "Courses" section khaali dikhna chahiye (empty state).
- Dashboard → "No courses yet" empty state.
- Admin → Upload se naya course banake test karo.
