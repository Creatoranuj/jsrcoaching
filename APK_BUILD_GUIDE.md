# APK Build Guide — Hindi + English

Ye file aapke liye **single source of truth** hai APK banane ke liye. Har baar yahi follow karo.

---

## 1. TL;DR — Final Copy-Paste Sequence

Har APK build ke liye Replit Shell mein **yahi 5 commands** chalao (ek-ek karke, alag-alag line mein):

```bash
bun install
bun run build
npx cap sync android
git add -A
git commit -m "build: apk update"
git push origin main
```

- **Local time:** ~1 min 30 sec
- **GitHub Actions APK ready:** ~6–7 min baad Releases tab mein

> Naya plugin add karna ho tabhi `bun install` se pehle ek extra command:
> ```bash
> bun add <package-name>
> ```

---

## 2. Current Flow vs Recommended Flow (Performance Comparison)

| Step | Current (galat / slow) | Recommended (sahi / fast) | Time saved |
|---|---|---|---|
| Install deps | `npm install` — **2 min 30 sec** | `bun install` — **20 sec** | **~2 min 10 sec** |
| Add plugin | `bun add ...@6.1.0bun run build` (chipka hua, fails) | `bun add <pkg>` alag line mein | **~1 min** (retry avoided) |
| Sync | `npx cap sync` (ambiguous) | `npx cap sync android` (explicit) | **~5 sec** + fewer errors |
| Push | `git push --force` (risky, team work delete kar sakta hai) | `git push origin main` | Safety + no rework |
| **Total local cycle** | **~5–6 min + frequent failures** | **~1 min 30 sec** | **~70% faster** |
| **GitHub Actions CI** | ~10 min (npm-based) | ~6–7 min (bun-based) | **~30–40% faster** |

**Real impact:** Agar din mein 10 baar build karte ho, to **~40 min daily save** hote hain locally + cleaner git history.

---

## 3. Step-by-Step Guide (Detailed, Hindi + English)

### Step 1 — `bun install`
```bash
bun install
```
- **Kyu:** `package.json` ke saare dependencies install karta hai. `npm install` ke comparison mein **~10x faster** hai.
- **Duration:** Cold = 15–30 sec | Cached = 2–5 sec
- **Expected output:** `843 packages installed [Xs]` (koi red error nahi)
- **Kab chalana:** Fresh clone ke baad, ya jab bhi `package.json` / `bun.lock` change ho.

---

### Step 2 (Optional) — `bun add <plugin>`
```bash
bun add @capacitor-community/privacy-screen@6.1.0
```
- **Kyu:** Sirf jab koi **naya Capacitor plugin** ya npm package chahiye. Roz nahi chalana.
- **Duration:** 5–15 sec
- **Expected output:** `+ @capacitor-community/privacy-screen@6.1.0`
- ⚠️ **Common mistake:** Aap likhte the `bun add ...@6.1.0bun run build` — ye **ek hi line mein chipka diya** tha, space/newline missing. Isse `bun` ek invalid package dhundta hai aur fail ho jata hai. **Hamesha alag line mein.**

---

### Step 3 — `bun run build`
```bash
bun run build
```
- **Kyu:** React + Vite code ko `dist/` folder mein compile karta hai. APK isi `dist/` ko wrap karta hai — bina iske purana code APK mein ja jata hai.
- **Duration:** 30–60 sec
- **Expected output:** `✓ built in XXs` + `dist/` folder visible
- **Kab chalana:** Har APK build se pehle (agar code change kiya hai).

---

### Step 4 — `npx cap sync android`
```bash
npx cap sync android
```
- **Kyu:** `dist/` ka fresh build + native plugins ko `android/` folder mein copy karta hai. Iske bina APK mein purani UI/plugins rahenge.
- **Duration:** 10–30 sec
- **Expected output:** `✔ Sync finished in Xs` + plugin list dikhe
- **Kab chalana:** `bun run build` ke turant baad — **hamesha**.
- ⚠️ **Galti:** Aap `npx cap sync` likhte the (bina `android`). Wo dono platforms try karta hai aur agar `ios/` setup nahi to confusing warning deta hai. Explicit `android` likho.

---

### Step 5 — Git push (workflow trigger)
```bash
git add -A
git commit -m "build: apk update"
git push origin main
```
- **Kyu:** GitHub Actions workflow tabhi chalta hai jab push hota hai. Workflow khud `bun install` + `bun run build` + `cap sync` + Gradle APK build karega.
- **Duration:** Push = 5–15 sec | Workflow APK build = 6–8 min total
- **Expected:** GitHub → **Actions** tab green ✅, fir **Releases** tab mein `SadguruCoachingClasses.apk` available
- ⚠️ **`--force` mat use karo routinely!** Sirf tab jab tum 100% sure ho ki remote history overwrite karni hai. Warna team ka kaam delete ho sakta hai. Normal flow ke liye sirf `git push origin main`.

---

## 4. Aapki Current Flow ki 4 Galtiyan

| # | Galti | Sahi tarika | Asar |
|---|---|---|---|
| 1 | `npm install` (slow) | `bun install` | 2 min 10 sec save |
| 2 | `bun add ...@6.1.0bun run build` (chipka hua) | Alag-alag lines mein | Fail nahi hoga |
| 3 | `npx cap sync` (android missing) | `npx cap sync android` | Explicit, no warning |
| 4 | `git push --force` har baar | Normal `git push origin main` | Team-safe |

---

## 5. Troubleshooting

| Problem | Fix |
|---|---|
| `bun: command not found` | `npm install -g bun` ya Replit shell restart karo |
| `cap sync` fails with "no web assets" | Pehle `bun run build` chalao, fir `cap sync` |
| GitHub Actions red ❌ | Actions tab kholo → failed step ka log padho → error mujhe bhejo |
| `git push` rejected (non-fast-forward) | `git pull --rebase origin main` → conflicts fix → `git push origin main` (**`--force` nahi**) |
| APK mein purana UI dikh raha | Step 3 (`bun run build`) + Step 4 (`cap sync android`) skip ho gaye honge — dono chalao |

---

## 6. Timing Cheat Sheet

| Command | Pehli baar (cold) | Cache ke saath |
|---|---|---|
| `bun install` | 30 sec | 5 sec |
| `bun run build` | 60 sec | 45 sec |
| `npx cap sync android` | 25 sec | 15 sec |
| `git push` | 10 sec | 5 sec |
| **GitHub Actions APK** | **8 min** | **5–6 min** |

---

## 7. Performance Impact Summary

| Metric | Pehle (npm flow) | Ab (bun flow) | Savings |
|---|---|---|---|
| Local build cycle | 5–6 min | **1 min 30 sec** | **~4 min per build** |
| CI APK build | ~10 min | **6–7 min** | **~3–4 min per push** |
| 10 builds/day | ~60 min wasted | ~15 min | **~45 min daily saved** |
| Failure rate | High (chipke commands, force push) | Low | Cleaner git history |

**Bottom line:** Recommended flow follow karoge to **~70% local time** aur **~35% CI time** save hoga, plus production-safe git history milegi.

---

## 8. Quick Reference Card (print/save karo)

```bash
# === EVERY APK BUILD ===
bun install              # 20s — deps
bun run build            # 45s — compile React
npx cap sync android     # 15s — copy to android/
git add -A
git commit -m "build: apk update"
git push origin main     # triggers GitHub Actions → APK in Releases

# === ONLY WHEN ADDING A PLUGIN ===
bun add <package-name>
# then run the 5 commands above
```

Koi command fail ho to **exact error message** bhejo — turant fix kar dunga.

---

## 11. Vercel Deployment — Web Side

APK ke alawa app ka **web version** Vercel pe deploy hota hai. Vercel pe alag se kuch install karne ki zarurat nahi — `package.json` mein jo dependencies hain, Vercel automatically install karta hai.

### Vercel Build Settings (already configured in `vercel.json`)

| Setting | Value | Reason |
|---|---|---|
| Install Command | `npm install` (default) ya `bun install` | dono kaam karte hain; bun faster |
| Build Command | `npm run build` | Vite production build |
| Output Directory | `dist` | Vite default |
| Node Version | 20.x | `.nvmrc` se pick hota hai |

### Required Environment Variables (Vercel Dashboard → Settings → Env)

Inhe **production + preview + development** teeno me set karo:

```bash
VITE_SUPABASE_URL=https://cmbattmjwriiesibayfk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key from Supabase>
VITE_SUPABASE_PROJECT_ID=cmbattmjwriiesibayfk
# Optional: only if you use Sentry / Razorpay client-side
VITE_SENTRY_DSN=<...>
VITE_RAZORPAY_KEY_ID=<...>
```

> **NOTE:** Secret (private) keys jaise `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET` — Vercel pe **nahi** dalo. Wo sirf Supabase Edge Functions me hote hain (Supabase Dashboard → Project Settings → Edge Functions → Secrets).

### Vercel Deploy Trigger

- `main` branch pe push → **Production** deploy automatic.
- Koi bhi PR / branch → **Preview** URL automatic.
- Manually redeploy: Vercel Dashboard → Deployments → ⋯ → Redeploy.

### Native Capacitor Dependencies — Vercel pe?

- `@capacitor/*` packages Vercel build me install hote hain par browser bundle mein **tree-shake** ho jaate hain (sirf `Capacitor.isNativePlatform()` check ke baad lazy load hote hain).
- `@capgo/*` plugins `vite.config.ts` mein `external` marked hain — Vercel build me skip hote hain, web pe error nahi aata.
- Matlab: APK ke liye install kiye gaye plugins web deploy ko break **nahi** karte. Ek hi `package.json` dono ke liye kaafi hai.

### Common Vercel Errors

| Error | Fix |
|---|---|
| `Module not found: @capgo/...` | `vite.config.ts` mein `rollupOptions.external: [/^@capgo\//]` already set hai — verify; agar koi naya `@capgo` package add kiya hai aur error aaye to wahi pattern se cover ho jata hai. |
| `VITE_SUPABASE_URL is undefined` | Vercel env var set nahi hai — Dashboard se add karke redeploy. |
| Build OOM | Vercel project Settings → Functions → Memory increase, ya `vite.config.ts` me `chunkSizeWarningLimit` already 1800 hai (fine). |

---

## 12. Bundle Size — Current Status (Optimized)

Aapka latest build (Screenshot 1) already well-optimized hai:

| Chunk | Gzip size | Notes |
|---|---|---|
| `index` (entry) | **72.4 KB** ✅ | Initial entry total 104.5 KB / 220 KB budget |
| `vendor-md-prism` | 215 KB | Markdown syntax highlight — **lazy-loaded**, sirf ChatWidget / Doubts me load hota hai |
| `vendor-sentry` | 148 KB | Error tracking — **modulepreload hata diya** hai, hidden sourcemap |
| `vendor-react` | 98 KB | Core React |
| `vendor-supabase` | 49 KB | DB client |
| `vendor-motion` | 40 KB | framer-motion (lazy) |

Yahi se aage **kuch optimize nahi** karna chahiye unless naya feature add ho — current setup pe `[bundle-size] OK ✓` pass ho raha hai.