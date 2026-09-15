# 🛠️ Safar Englishka — Admin Guide (Aasan Bhasha)

Ye guide admin ke liye hai — jo courses banate hain, students manage karte hain, ya payments dekhte hain. Bilkul simple, click-by-click.

---

## 1. Admin panel kaise kholein

1. Login karein apni **admin email** se.
2. URL me `/admin` type karein (ya profile menu me **Admin Panel** button).
3. Dashboard khulega.

**Kaun access kar sakta hai?** Sirf `admin` role wale users. Ye role database me set hota hai — kisi normal user ko admin banane ke liye developer se poocho.

`[Screenshot: admin dashboard]`

---

## 2. Dashboard me kya-kya dikhta hai

Top par 4 cards:
- **Total Students** — jitne signup hue
- **Active Courses** — jo abhi live hain
- **Total Revenue** — Razorpay se
- **Today's Signups** — aaj ke naye users

Neeche shortcut buttons:
- CMS (Content Management)
- Users
- Fraud Watch
- Analytics
- Moderation
- Security
- Live Sessions
- Quiz Manager

---

## 3. Naya Course kaise banaye

1. Admin → **CMS** → **Courses** tab.
2. Top right **+ New Course** button.
3. Form bharein:
   - **Title** — e.g. "Class 10 Science 2027"
   - **Description** — 2-3 lines
   - **Price** — 0 = free, ya paisa daalein (₹499, ₹999)
   - **Thumbnail** — image upload
   - **Grade / Board** — Class 10, CBSE
   - **Is Active** — ON karein tabhi students ko dikhega
4. **Save** dabayein.

### Course edit
Course card par tap → **Edit** icon → change → Save.

### Course hide/delete
- **Hide** — Is Active OFF (students ko nahi dikhega, data bacha rahega)
- **Delete** — permanent (careful!)

---

## 4. Chapter aur Lesson add karna

### Chapter banao
1. Course kholo → **Chapters** tab.
2. **+ Add Chapter** → Title (e.g. "Chapter 1: Light")
3. Save.

### Lesson add karo chapter me
1. Chapter kholo → **+ Add Lesson**.
2. Fields:
   - **Title** — e.g. "Reflection of Light"
   - **Video URL** — Bunny Stream link (ya YouTube ID)
   - **Duration** — auto detect hoga
   - **PDF (Notes)** — upload
   - **DPP** — Daily Practice sheet upload
   - **Thumbnail** — video ka preview
3. Save → student ke liye turant live.

### Lesson lock/unlock
- **Locked** = paid users ko hi milega
- **Free preview** = sabko dikhega (marketing ke liye)

---

## 5. Quiz kaise banaye

1. Admin → **Quiz Manager**.
2. **+ New Quiz** → basic info:
   - Title, Course, Chapter link
   - Duration (minutes)
   - Pass percentage
3. **Add Question** — for each:
   - Question text
   - 4 options (A, B, C, D)
   - Correct answer select
   - Marks (1, 2, 4...)
   - Negative marking (agar hai)
   - Explanation (review me dikhega)
4. Save.

### Bulk import
CSV upload option bhi hai — template CSV download karein, fill karein, upload.

### Question edit
Quiz kholo → question par tap → edit → save.

---

## 6. Live Class kaise schedule kare

1. Admin → **Live Sessions** ya **Timetable**.
2. **+ New Live Class**:
   - Title
   - Course / Batch
   - Date & Time
   - Zoom/YouTube live URL
   - Teacher assign
3. Save → students ko notification aayega.

### Reminder
System apne aap 10 min pehle push notification bhejta hai — kuch nahi karna.

---

## 7. Students kaise dekhein aur block kare

1. Admin → **Users** (`/admin/users`).
2. Search bar me naam / email / phone daalein.
3. Student card par tap → **detail view**:
   - Batches (kaun se courses me hai)
   - Payments history
   - Last login
   - Activity (lessons watched, quiz score)

### Block user
1. Detail view me **Block User** button (laal).
2. Reason likhein (e.g. "sharing account").
3. Confirm → user turant logout, comments post nahi kar sakta.

### Unblock
Same button ab **Unblock** dikhega → tap.

---

## 8. Fraud Watch (bahut important!) 🚨

Ye page dikhata hai kaun bina paise diye course me ghusa hai (hacker, bypass, ya technical glitch).

1. Admin → **Fraud Watch** (`/admin/fraud-watch`).
2. List me suspicious enrollments — har row me:
   - Student naam + email
   - Course
   - **Rule** — kya galat hai (e.g. "no_payment", "amount_mismatch", "duplicate_order")
   - **Severity** — 🔴 Critical / 🟠 High / 🟡 Medium
3. Har row me 2 buttons:
   - **Revoke Access** — course chheen lo (paise nahi diye)
   - **Mark Legit** — agar aap check kar chuke ho ki payment sahi hai (whitelist)

### Kab check kare?
Har din ek baar Fraud Watch dekh lein — 2 minute ka kaam hai. Critical items pehle solve karein.

### Detection rules
- **no_payment** — enrollment hai lekin Razorpay me koi payment nahi
- **amount_mismatch** — kam paisa diya (course ₹999 par ₹1 diya)
- **duplicate_order** — ek order ID 2 alag users ke saath
- **payment_failed** — payment fail hua lekin enrollment ban gaya
- **velocity** — 10 min me 5+ enrollments (bot suspected)

---

## 9. Analytics — sab kuch numbers me

1. Admin → **Analytics** (`/admin/analytics`).
2. Metrics dikhega:
   - **DAU / WAU / MAU** — Daily/Weekly/Monthly Active Users
   - **Signup trend** — line chart last 30 din
   - **Revenue** — kul kamai + Razorpay pending
   - **APK Downloads** — GitHub release download count (real-time)
   - **Top Courses** — sabse jyada enrollment wale

Date range change kar sakte hain — top right me date picker.

---

## 10. Notices aur Hero Banner

### Notice (announcement) bhejo
1. Admin → CMS → **Notices** tab.
2. **+ New Notice**:
   - Title
   - Content (HTML support)
   - **Target Role** — All / Students / Teachers
   - **Expiry date** — kab tak dikhe
   - **Pinned** — top par fix karo
3. Save → sabko notification.

### Hero Banner (homepage ka bada image)
1. CMS → **Hero Banners**.
2. **+ Add Banner**:
   - Image upload
   - Title, Subtitle
   - Link (e.g. course page)
   - Order (kaun pehle dikhega)
   - Active ON/OFF
3. Save → homepage refresh par dikhega.

---

## 11. Comments / Doubts moderation

1. Admin → **Moderation** (`/admin/moderation`).
2. Reported content list — kya report hua, kisne kiya, reason.
3. Actions:
   - **Hide** — sabko chhupa do (data bacha rahega)
   - **Delete** — permanent (galiya, spam ke liye)
   - **Ban user** — bar-bar galat post kare to

### Auto-hidden
Kuch words auto-block hote hain (galiya, phone number sharing). Wo apne aap Moderation queue me aa jate hain.

---

## 12. Payment refunds

### Refund request approve/reject
1. Admin → CMS → **Payment Requests**.
2. Pending list dikhegi — student naam, course, amount, reason.
3. **Approve** → Razorpay se refund initiate hoga, enrollment cancel.
4. **Reject** → reason likhein, student ko notification.

### Manual refund (edge case)
Razorpay dashboard me jaake bhi refund kar sakte hain — us case me system apne aap 24 hr me sync ho jayega.

---

## 13. Security dashboard

1. Admin → **Security** (`/admin/security`).
2. **Dependency Scan** — 3rd-party packages me koi vulnerability hai kya, real-time OSV.dev se check.
3. **Run Scan** button dabayein — 30 sec me report.
4. Har finding par severity + fix instructions.

Har hafte ek baar chala lein.

---

## 14. Common problems (Admin)

| Problem | Solution |
| ------- | -------- |
| Student ko course access nahi mil raha | Users → check enrollment status; agar "revoked" hai to Fraud Watch me dekhein |
| Video upload fail | File size <500 MB, format MP4/HLS; Bunny Stream dashboard check |
| Quiz me galat sahi jawab dikha | Quiz Manager → question edit → correct answer verify |
| Notification nahi ja rahi | CMS → Notices → check "Active" ON; user ne app me notification allow ki hai? |
| Analytics numbers 0 dikha rahe | Date range check → last 24 hr me refresh hota hai |
| Payment show ho raha hai lekin enrollment nahi | Fraud Watch me dekho "payment_for_wrong_course" rule; manual grant kar do |
| Live class link kaam nahi kar rahi | Zoom/YouTube URL edit, publish dobara |

---

## 15. Golden rules (kabhi mat bhoolo)

1. **Kabhi bhi kisi student ko manually admin mat banao** app ke through — sirf developer database me kare.
2. **Fraud Watch daily dekho** — har enrollment jo bina paise ke hai, ya to legit mark karo ya revoke.
3. **Course delete se pehle** enrollment check karo — agar students hain to sirf "hide" karo.
4. **Password / OTP** kabhi kisi ke saath share mat karo — support bhi nahi maangta.
5. **Backup**: important content ka backup rakhein (Lovable → Cloud → Advanced settings → Export data).

---

## 16. Quick reference — Kaun sa page kis kaam ka

| URL | Kaam |
| --- | ---- |
| `/admin` | Main dashboard |
| `/admin/users` | Student list + block |
| `/admin/fraud-watch` | Bypass enrollments |
| `/admin/analytics` | Numbers, revenue, downloads |
| `/admin/moderation` | Comment/doubt reports |
| `/admin/security` | Dependency vulnerabilities |
| `/admin/cms` | Courses, chapters, lessons, notices, banners |
| `/admin/quiz-manager` | Quiz banao/edit |
| `/admin/live-sessions` | Live class schedule |
| `/admin/student/:id` | Ek student ka full profile |

---

**Kuch bhi confuse ho to developer se WhatsApp par pooch lein — 2 minute me solution.** 🙏