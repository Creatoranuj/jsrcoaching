# App Feature Audit — Login karke har page test kiya

Aapki ID (`Shomarnashaurya@gmail.com`) se login hua — login successful, dashboard khula. Account **Admin** hai. 23 pages click karke check kiye.

**Rating: 3/5** — zyada-tar features chal rahe hain, lekin 2 page tooté hue hain aur branding/logo abhi bhi purana Sadguru wala dikh raha hai.

## Jo sahi chal raha hai
- Login, Profile, Sign out
- Courses (2 courses), My Courses (2 enrolled), All Classes, All Tests (quiz "Start Quiz" ready)
- Attendance (6 students, P/A/L buttons), Timetable, Reports, Books, Library, Materials, Downloads, Messages (contact list), Subscription (plans + prices), Live Classes, Doubt Sessions, Syllabus

## Jo toota hua hai (fix karna hai)

### 1. Notices page kabhi load hi nahi hota — HIGH
Page hamesha grey skeleton par atka rehta hai. Notices maangne wali request database se error de rahi hai kyunki do aise column maange ja rahe hain jo table me hain hi nahi (`author_name`, `updated_at`).
**Fix:** sirf asli columns maangein — aur notice ke saath attach PDF bhi laayein (`pdf_url`), jo abhi miss ho raha hai.

### 2. Community me Like count hamesha 0 — HIGH
Like/unlike ka counting database function app me call hota hai par database me wo function bana hi nahi hai (404).
**Fix:** migration se `get_post_reactions` function banayein (sirf total count + "maine like kiya ya nahi" return kare, kisi aur ka naam expose na ho).

### 3. Purana Sadguru logo abhi bhi har page par — HIGH (branding)
Top header, side menu aur neeche wale floating chat bubble me purana "SC" crest dikh raha hai.
**Fix:** JSR COACHING ka mark use karein (landing page wala brand mark) — header, sidebar aur chat bubble teeno jagah.

### 4. Neeche "Profile" ka naam floating button ke peeche chhup raha hai — HIGH (mobile)
Bottom bar ka aakhri item "Profile" floating settings/chat button se dhak jaata hai.
**Fix:** floating button ko thoda upar shift karein taaki bottom bar ke item se na takraye.

### 5. Dashboard lagbhag khaali — MEDIUM
Login ke baad sirf "Quick Actions" ke 4 box dikhte hain — na welcome, na "continue learning", na aaj ki class.
**Fix (is plan me):** enrolled course ka continue-learning card, upcoming live/test aur latest notice dashboard par dikhayein.

### 6. Purana content text — MEDIUM
- Community ki pehli post: "Welcome to Naveen Bharat Community"
- Reports card "Course Progress" spinner par atka dikhta hai
**Fix:** post ka text JSR COACHING kar dein; Course Progress ki loading ko proper empty state dein.
Note: course ke thumbnail images me "Safar English" likha hai — wo picture ke andar likha hua hai, naye images banane padenge (aap kahen to alag se banata hoon).

### 7. Chhoti technical warning — LOW
Har page par ek React ref warning console me aati hai (dikhne me farq nahi padta). Saath me theek kar dunga.

## Technical notes
- `src/hooks/useNotices.ts:56` — select list ko actual schema se match karna: `id,title,content,author_id,is_pinned,target_role,expires_at,created_at,pdf_url`; `NoticeRow`/`Notice` me `pdfUrl` add.
- Migration: `public.get_post_reactions(_post_ids uuid[])` — `security definer`, `stable`, `set search_path = public`, returns `post_id, like_count bigint, liked_by_me boolean`; `grant execute` to `authenticated` (anon nahi).
- Logo: `src/assets/branding/nb-mark.webp` -> JSR mark; `Header.tsx`, `Sidebar.tsx`, chat bubble avatar.
- Floating button/bottom-nav overlap: bottom offset ko `calc(4.5rem + env(safe-area-inset-bottom))` par le jaana.
- Dashboard: existing `get_dashboard_snapshot` RPC se continue-learning + upcoming items render karna.

## Verify
Dobara login karke Notices, Community like, Dashboard, aur bottom bar 411px mobile par check karunga — koi failed request na ho.
