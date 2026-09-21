# Survival Mode — aasan guide

Ye feature ek hi maqsad ke liye hai: **kuch bhi ho jaye, padhai na ruke.**

Server par load badh jaye, koi service down ho, ya kharcha kam karna ho — admin
ek-ek cheez band kar sakta hai, bina app tode aur bina naya code deploy kiye.

---

## 1. Teen sakht niyam

1. **Kuch set nahi kiya = sab ON.** Aaj jaisa app chal raha hai, waisa hi chalta
   rahega. Ye feature apne aap kuch band nahi karta.
2. **Ye cheezein kabhi band nahi hoti (protected):** login, My Courses, chapter,
   lesson, PDF, video, payment, quiz scoring. Database me galti se `false` likh
   bhi diya jaye, app inhe ON hi maanega.
3. **Band karna reversible hai.** Ek tap ON, ek tap OFF. Koi data delete nahi
   hota.

---

## 2. Admin kya karega

Admin → **System & Survival Mode** (`/admin/system`)

- **Features** — 13 chips (Doubts, Community, Messages, Reports, Notices,
  Downloads, Quiz, Live, Books, Library, AI Assistant, Search, Notifications).
  Chip tap karo → ON/OFF.
- **Server functions** — 26 chips. OFF karne par wo function server par bhi
  band ho jata hai (503 lautata hai), sirf UI me chhupta nahi.
- **Survival Mode button** — ek tap me saari bhaari cheezein (AI, search,
  community, doubts, messages, reports, notifications, scraping, push) band.
  "Sab normal karo" se sab wapas.
- **Protected list** — sirf dikhane ke liye; in par tap karne se kuch nahi hota.

Change turant lagu hota hai (cache saaf ho jata hai, koi deploy nahi chahiye).

---

## 3. Device ka apna "halka mode" (automatic)

Admin ke bina bhi ek safety hai:

- Agar **60 second me 3 baar** server se baat nahi ban paati, to **usi device**
  par halka mode chalu ho jata hai.
- Upar ek shaant Hinglish banner aata hai (laal error nahi):
  _"App abhi halke mode me hai — lecture, PDF aur video chalte rahenge."_
- **2 minute baad** device khud normal ho jata hai. Kuch karna nahi padta.

File: `src/lib/serviceHealth.ts`

---

## 4. Snapshot — server na mile tab bhi list dikhe

Jo lists student pehle dekh chuka hai (courses, chapters, lessons, PDFs) unka
chhota snapshot device par rehta hai — **30 din** tak, kul ~1.5 MB.

Server na mile to wahi snapshot dikh jata hai, aur student apne pehle se
downloaded lecture/PDF khol sakta hai.

File: `src/lib/contentSnapshot.ts` — pattern: `withSnapshot("key", fetcher)`

---

## 5. Technical notes (developer ke liye)

| Cheez | File |
| --- | --- |
| Saari switch keys, protected list, resolver | `src/lib/systemSwitches.ts` |
| Device auto halka mode | `src/lib/serviceHealth.ts` |
| 30-din snapshot | `src/lib/contentSnapshot.ts` |
| React hook | `src/hooks/useSystemSwitches.ts` |
| Banner | `src/components/SurvivalBanner.tsx` |
| Admin panel | `src/components/admin/SystemSwitchManager.tsx` |
| Admin page | `src/pages/AdminSystem.tsx` |
| Server guard | `supabase/functions/_shared/systemSwitch.ts` |

**Storage:** wahi purana `site_settings` table (key/value text). Koi nayi table
nahi, koi migration nahi.

**Keys:**
- Feature: `sys_feature_<naam>` (jaise `sys_feature_community`)
- Edge function: `sys_edge_<naam_underscore>` (jaise `sys_edge_chatbot`)

**Read path:** `loadSiteSettingRows()` — wahi ek cached read jo menu flags,
lesson flags waghairah use karte hain. Koi extra query nahi.

**Value parsing:** `false` / `0` / `off` / `no` = OFF. Baaki sab (aur missing
key) = ON.

### Nayi cheez ko switch ke peeche lagana

```tsx
const { feature } = useSystemSwitches();
if (!feature("community")) return null;
```

### Naye edge function ko guard karna

```ts
import { guardSwitch } from "../_shared/systemSwitch.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const off = await guardSwitch("my-function", corsHeaders);
  if (off) return off;

  // ...normal kaam
});
```

Naye function ka naam `EDGE_FUNCTION_SWITCHES` (client) me add karna mat
bhoolna, warna admin screen par chip nahi aayega.

### Kisi cheez ko protected banana

`PROTECTED_KEYS` (client) aur `PROTECTED_FUNCTIONS` (server) — dono me naam
add karo. Dono jagah hona zaroori hai.

---

## 6. Fail-open ka waada

Har jagah galti ka natija ek hi hai: **cheez chalu rehti hai.**

- `site_settings` read fail → sab ON
- Server par env missing → sab ON
- Guard me exception → function normal chalta hai
- Snapshot na mile → normal error path

Yaani ye system kabhi khud outage ki wajah nahi banega.
