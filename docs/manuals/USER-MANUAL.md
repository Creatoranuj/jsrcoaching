# Safar English — User Manual (Student Guide)

> Hinglish · v1.0 · 2026-07-19
> Website + Android app dono ke liye. Jahan koi cheez sirf app me hai wahan **[APP ONLY]** likha hai.

---

## Table of Contents

1. Welcome & Install
2. Account (Signup / Login / Profile)
3. Home & Dashboard
4. Browse & Buy Courses
5. My Courses (Subjects → Chapters → Lessons)
6. Lesson Video Player
7. Notes, DPP, PDF, Notion attachments
8. Quizzes / Tests
9. Ask Doubt
10. AI Chat Assistant
11. Live Classes
12. Community
13. Downloads & Offline
14. Notifications
15. Books, Smart Notes, Personal Library
16. Timetable, Attendance, Reports, Notices
17. Settings
18. Android app specifics
19. Troubleshooting
20. Help & FAQ
21. Glossary

---

## 1. Welcome & Install

Safar English ek complete English-learning platform hai — recorded lectures, live classes, notes, DPP, quizzes, doubts, community — sab ek jagah.

### 1.1 Web (browser)
- Koi bhi modern browser me kholiye: Chrome, Edge, Safari, Firefox.
- URL: aapke institute ne jo diya hai (e.g. `https://safarenglish.app`).
- Route `/install` par ja kar aap PWA install ya APK download kar sakte hain.

### 1.2 Android app (APK) [APP ONLY]
1. `/install` page kholiye.
2. "Download APK" par tap kariye — bina redirect ke direct download shuru hoga.
3. Downloaded file par tap → "Install" → agar warning aaye toh "Install anyway".
4. Home-screen se app icon (golden **S**) tap karke open kariye.

### 1.3 PWA install (iPhone / Android browser)
- **Android Chrome**: menu → *Add to Home screen*.
- **iPhone Safari**: Share → *Add to Home Screen*.

### 1.4 Offline support
- Recently opened PDFs aur Downloads tab ke items bina internet ke bhi khulte hain.
- Live class, buying courses, quizzes ke liye internet chahiye.

---

## 2. Account

### 2.1 Signup (`/signup`)
- Naam, email, mobile, strong password.
- Email par verification link → click karke account activate.

### 2.2 Login (`/login`)
- Email + password. "Remember me" default on.

### 2.3 Phone OTP login (`/login-otp`)
- Mobile number → OTP SMS → verify.

### 2.4 Forgot password (`/forgot-password`)
- Email daaliye → reset link → new password.

### 2.5 Profile (`/profile`)
- Avatar, naam, mobile, city, class update.
- Change password.

### 2.6 Account delete request (`/delete-account`)
- Public route. Reason bhar ke submit karo — admin review karega (GDPR-safe).

---

## 3. Home & Dashboard

`/dashboard` — login ke baad landing.

### 3.1 Bottom navigation (mobile)
| Icon | Route | Kaam |
| --- | --- | --- |
| Home | `/dashboard` | Latest lessons, live, notices |
| Courses | `/courses` | Naye courses browse karo |
| My Courses | `/my-courses` | Kharide hue courses |
| Downloads | `/downloads` | Offline files |
| Profile | `/profile` | Account, settings |

### 3.2 Top bar
- **Notification bell** — new lesson, live, doubt reply.
- **Batch switcher** — agar aapke paas multiple batches ho.
- **Search** — lecture / note / quiz search.

---

## 4. Browse & Buy Courses

### 4.1 Browse (`/courses`)
- Class / exam / price ke hisaab se filter.
- Tile par tap → `/course/:id` detail page.

### 4.2 Course detail
- Faculty, syllabus, kya-kya milega, price (₹), reviews.
- **Buy Course** button → `/buy-course/:id`.

### 4.3 Payment (Razorpay)
- UPI (GPay/PhonePe/Paytm), Debit/Credit card, Net-banking, Wallets — sab supported.
- Payment success par app khud "My Courses" me daal deta hai.
- Receipt email par milta hai. Order id `payment-callback` page par bhi dikhta hai.

### 4.4 "Bank could not verify your payment"
- Ye Razorpay/bank ka **3D-Secure** decline message hai — hamare app ka error nahi.
- Fix: dusra UPI app / card try karo, ya thoda ruk ke retry karo.

### 4.5 Refund
- Profile → Help → Refund request. Admin manually initiate karega.

---

## 5. My Courses

### 5.1 List (`/my-courses`)
Aapke kharide/allotted courses cards me.

### 5.2 Course detail (`/my-courses/:courseId`)
Do views:
- **Subjects view** — top-level subjects (yahaan `CH-` badge/prefix nahi dikhta).
- **Chapters view** — subject tap karke → `Ch <code>:` prefix aur `CH` badge dikhta hai taaki aap chapter number identify kar sako.

### 5.3 Lessons
- Chapter tap → lessons list.
- Har lesson me: 🎥 video / 📄 PDF / 📝 Notes / 🧮 DPP / 🧪 Test in-line dikh sakta hai.
- Completed lessons par ✓ tick.

---

## 6. Lesson Video Player

`/classes/:courseId/lessons` — custom Bunny / YouTube player (branding hidden).

### 6.1 Controls
| Action | Kaise |
| --- | --- |
| Play / Pause | Center button tap, ya `Space` |
| 10 s forward | Right skip button, double-tap right side, `→` |
| 10 s backward | Left skip button, double-tap left side, `←` |
| Volume | Slider, `↑ / ↓` |
| Mute | `M` |
| Speed | ⚙ Settings → 0.5x – 2x |
| Rotate + Fullscreen | ⟳ icon (1 tap = landscape + fullscreen dono) |
| Exit fullscreen | Wahi ⟳ icon dobara, ya hardware Back / `Esc` |

### 6.2 Auto-hide behavior
- Play button tap karne ke baad controls 5 second tak nazar aati hain phir hide hoti hain.
- Screen tap karke wapas dikha sakte ho.

### 6.3 Security
- Right-click / long-press context menu disabled.
- Screenshot par institute watermark visible.

### 6.4 Continue watching
- Aap jahaan chhod ke gaye the wahin se resume — 5-second heartbeat progress save karta hai.

---

## 7. Notes, DPP, PDF & Notion attachments

Har lesson ke neeche attachments accordion:

| Type | Kya hota hai |
| --- | --- |
| **PDF** | In-app pdf.js reader — zoom, page-jump, night mode |
| **Notes** | Markdown reader (dark/light) |
| **DPP** | Daily practice PDF |
| **Test** | Quiz link (see §8) |
| **Notion page** | Notion published page in-app render |
| **Image / Video / Office** | Universal viewer |

Har viewer me top bar par:
- ⬅ Back
- 🔖 **Add to My Library** — permanent bookmark
- 🌐 Open in browser
- ⬇ Download (offline)

### 7.1 My Library (`/library`)
Jo bhi 🔖 karoge wahan appear hoga — kabhi bhi kholo.

### 7.2 Downloads (`/downloads`) [APP ONLY offline]
⬇ ki hui files, storage usage, delete option.

---

## 8. Quizzes / Tests

### 8.1 List (`/all-tests`)
Subject-wise / course-wise tests.

### 8.2 Attempt (`/quiz/:quizId`)
- Timer top-right (agar set ho).
- Question navigation (Previous / Next / jump).
- Save & Next / Mark for Review.
- Submit ke baad turant score.

### 8.3 Secure review (`/quiz/:quizId/result/:attemptId`)
- Answers server par score hoti hain (`score-quiz` edge function).
- Review page correct answers, aapke answers, explanation dikhaata hai.
- Correct answers client me kabhi expose nahi hoti — anti-cheat.

### 8.4 Negative marking
- Agar quiz par enabled ho toh galat answer par −ve marks. Har question me clearly likha hoga.

---

## 9. Ask Doubt

### 9.1 Lesson ke andar se
- Player ke neeche **Ask Doubt** button.
- Text + optional screenshot upload.
- Teacher reply push notification se aayegi.

### 9.2 Doubts hub (`/doubts`)
- Aapke sabhi doubts + replies.
- Status: Open / Answered / Closed.

### 9.3 AI-assisted doubt
- Kuchh doubts turant `resolve-doubt` AI se answer ho jaate hain.
- Aap unhelpful mark kar sakte ho — teacher take over karega.

---

## 10. AI Chat Assistant

Right-bottom floating chat bubble.

### 10.1 Kya kar sakta hai
- Concept explain karna (Hinglish).
- Course navigate karna ("Chapter 5 kaha hai?").
- Grammar / vocabulary quick answers.

### 10.2 Controls
| Button | Kaam |
| --- | --- |
| Send | Message bhejo (Enter) |
| 🎤 Mic | Voice → text |
| Reset | Naya session shuru |

### 10.3 Session continuity
- Session id `sessionStorage` me save hota hai — tab band karke wapas khologe toh conversation continue.
- Reset button new session banata hai.

### 10.4 Error messages
| Message | Matlab |
| --- | --- |
| "Rate limit — thodi der ruk ke try karein" | Bahut jaldi jaldi bheja — 30 s ruko |
| "Credits exhausted" | Institute ka AI quota khatam — admin ko batao |
| "AI service temporarily down" | Backend rehearsal — 2 min me retry |

---

## 11. Live Classes

### 11.1 Timetable (`/timetable`)
Aane wali classes date/time ke saath.

### 11.2 All live (`/live`)
Aaj ki live classes cards.

### 11.3 Join (`/live/:sessionId`)
- **Join** button class start hone se 5 min pehle enable.
- Zoom-powered — camera/mic optional, chat available.
- Reminders (`live_reminders`) mange toh push notification.

---

## 12. Community (`/community`)

- Post likho, image attach karo.
- Reactions (👍 ❤️ 🎉).
- Comment karo.
- **Report** button — abusive content flag → admin moderation queue.
- Blocked users ki posts aapko dikhengi nahi.

---

## 13. Downloads & Offline

### 13.1 Downloads (`/downloads`)
- Offline PDFs list.
- Storage used / free.
- Swipe / trash icon se delete.

### 13.2 Video offline [APP ONLY]
- Jin lessons par ⬇ icon dikhta hai un ko save kar sakte ho.
- Files encrypted app-storage me — dusra app access nahi kar sakta.

---

## 14. Notifications

App pehli baar permission maangega — **Allow** karo. Notifications ke types:

- 📚 Naya lesson upload
- 🔴 Live class 5 min me shuru
- 📝 Quiz / DPP reminder
- 💬 Doubt reply
- 🎁 Naya course / offer

Settings me har type ka toggle hai.

---

## 15. Books, Smart Notes, Personal Library

- **Books** (`/books`) — recommended reading, sample chapters.
- **Materials** (`/materials`) — supplementary PDFs, worksheets.
- **Syllabus** (`/syllabus`) — subject-wise topic list.
- **Smart Notes** — auto-generated summary of a lesson (`summarize-video` function).
- **Personal Library** (`/library`) — aapki 🔖 saved files.

---

## 16. Timetable, Attendance, Reports, Notices

- **Timetable** (`/timetable`) — weekly schedule.
- **Attendance** (`/attendance`) — live class attendance %.
- **Reports** (`/reports`) — quiz scores, chapter mastery, progress graphs.
- **Notices** (`/notices`) — institute-wide announcements.

---

## 17. Settings (`/settings`)

| Setting | Options |
| --- | --- |
| Theme | Light / Dark / System |
| Language | Hinglish / English |
| Notifications | Per-type toggles |
| Video | Default speed, auto-play next |
| Downloads | Auto-delete after N days |
| Privacy | Show profile in community |
| Data | Clear cache, sign-out all devices |

---

## 18. Android app specifics [APP ONLY]

### 18.1 Back button
- Kahin bhi Back = parent screen (Dashboard nahi).
- Dashboard par Back = "Press back again to exit" hint.
- 2 s ke andar dobara Back = app exit.

### 18.2 Deep links
- WhatsApp / SMS ke lesson link app me khulte hain (aa1 branded).
- Notion / external links browser me kholte hain.

### 18.3 Safe area / notch
- App khud notch, gesture bar, keyboard ke liye padding adjust karta hai.

### 18.4 Video rotate
- Rotate icon = force landscape + fullscreen (§6). Phone auto-rotate off ho toh bhi kaam karega.

---

## 19. Troubleshooting

| Problem | Solution |
| --- | --- |
| Video load nahi ho raha | Internet check, refresh, dusra network try |
| PDF blank | Back → dobara open. Agar phir bhi blank, ⬇ download karke offline kholo |
| "Unauthorized / 401" | Logout → Login |
| Payment stuck | 10 min wait — auto-reconcile hota hai. Nahi hua toh Help se contact |
| "Bank could not verify" | Bank/UPI decline — dusra method try (§4.4) |
| Chat "Connection problem" | AI service temp down, 2 min me retry |
| App crash | Force stop → wapas kholo. Repeat crash ho toh Help me report |
| Notification nahi aa rhi | Settings → App notifications ON, phone battery-saver OFF |

---

## 20. Help & FAQ

**Q. Ek course kitne devices par chalega?**
A. Ek waqt me 2 devices — third login karoge to sabse purana logout ho jaayega.

**Q. Course lifetime hai?**
A. Har course ki validity detail page par likhi hoti hai (usually 1 year).

**Q. Videos download karke share kar sakta hoon?**
A. Nahi — encrypted hain, sirf app me chalti hain. Sharing = account ban.

**Q. Quiz me galat answer dikha raha hai**
A. Result screen par "Report question" karo — admin verify karega.

**Q. Support kaise contact karein?**
A. Profile → Help / Support form, ya `support@safarenglish.app`.

---

## 21. Glossary

| Term | Matlab |
| --- | --- |
| CH | Chapter code (e.g. CH-01) |
| DPP | Daily Practice Problems |
| PWA | Progressive Web App (install-able website) |
| Bunny | Bunny.net CDN — hamara video host |
| RLS | Row-Level Security — Supabase database rules |
| 3D-Secure | Bank's OTP-based card verification |

---

*End of User Manual · Admin ke liye [`ADMIN-MANUAL.md`](./ADMIN-MANUAL.md) padhiye.*