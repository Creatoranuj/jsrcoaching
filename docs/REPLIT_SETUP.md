# Replit Setup Guide — Safar English App

Yeh guide step-by-step batata hai ki **Replit** par is project ko run karne ke liye kaun-si commands chalani hain aur kaun-kaun si dependencies install karni hain.

> ⚠️ **Note:** Replit par Android APK build **nahi ho sakta** (Android SDK + emulator support nahi hai). Replit sirf **web preview (Vite dev server)** ke liye use karein. APK ke liye GitHub Actions ya local machine use karein.

---

## 1. Replit Template Choose karein

Naya Repl banate samay:
- **Template:** `Node.js` (ya `Vite + React + TS`)
- Phir top-right **⋮ → Import from GitHub** se apna repo import karein.

---

## 2. System Dependencies (Node version)

Replit me Node pre-installed hota hai. Version check karein:

```bash
node -v    # Chahiye: v22.x (minimum v20)
npm -v     # Chahiye: 10.x ya higher
```

Agar Node 22 nahi hai, project root me `replit.nix` file banayein:

```nix
{ pkgs }: {
  deps = [
    pkgs.nodejs_22
    pkgs.nodePackages.npm
    pkgs.git
  ];
}
```

Aur `.replit` file me run command set karein:

```toml
run = "npm run dev"

[nix]
channel = "stable-24_05"
```

Shell restart karne ke liye:
```bash
kill 1
```

---

## 3. Project Dependencies Install karein

Project root me **sirf yeh** command chalayein:

```bash
npm install --legacy-peer-deps --no-audit --no-fund
```

### Kyun `--legacy-peer-deps` zaroori hai?
Project me `capacitor-razorpay` aur React 18 ke beech peer-dependency conflict hai. Without this flag install **fail** ho jayega.

### ❌ Yeh commands MAT chalayein:
| Command | Kyun nahi |
|---|---|
| `npm install` | Peer-dep ERESOLVE error dega |
| `npm audit fix --force` | Breaking changes laa sakta hai |
| `rm -rf node_modules package-lock.json` | Zaroorat nahi, lockfile corrupt ho sakti hai |
| `npm update` | Versions break ho sakte hain |

---

## 4. Environment Variables (Replit Secrets)

Left sidebar me **🔒 Secrets** tab kholein aur yeh 3 keys add karein:

| Key | Value (Supabase dashboard se lein) |
|---|---|
| `VITE_SUPABASE_URL` | `https://cmbattmjwriiesibayfk.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key |
| `VITE_SUPABASE_PROJECT_ID` | `cmbattmjwriiesibayfk` |

> 🔐 **KABHI BHI** yeh secrets frontend / Replit me **NA** daalein:
> - `SUPABASE_SERVICE_ROLE_KEY`
> - `RAZORPAY_KEY_SECRET`
> - `RAZORPAY_WEBHOOK_SECRET`
>
> Yeh sirf Supabase Edge Functions me rehni chahiye.

---

## 5. TypeScript Check (optional but recommended)

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Errors aaye to pehle fix karein.

---

## 6. Dev Server Start karein

```bash
npm run dev
```

Replit automatically port forward karke **Webview** open karega.

`vite.config.ts` me yeh hona chahiye taaki Replit access kar sake:

```ts
server: {
  host: "::",
  port: 8080,
}
```

---

## 7. Production Build (optional)

```bash
npm run build      # dist/ folder banata hai
npm run preview    # Production preview chalata hai
```

---

## 8. ⚡ Quick Command Cheat Sheet

```bash
# 1. Install (one-time)
npm install --legacy-peer-deps --no-audit --no-fund

# 2. Type check (optional)
npx tsc --noEmit -p tsconfig.app.json

# 3. Dev server (rozana)
npm run dev

# 4. Production build
npm run build

# 5. Production preview
npm run preview
```

---

## 9. Common Errors & Fixes

| Error | Fix |
|---|---|
| `ERESOLVE peer dependency conflict` | `--legacy-peer-deps` flag use karein |
| `Cannot find module '@/...'` | `tsconfig.app.json` me path alias check karein |
| `VITE_SUPABASE_URL is undefined` | Replit Secrets me add karein, Repl restart karein (`kill 1`) |
| `Port 8080 already in use` | `kill 1` chalayein |
| `Module not found: capacitor-razorpay` | Web me ignore hota hai — sirf Android build me chahiye |
| `EACCES: permission denied` | `chmod +x node_modules/.bin/vite` |

---

## 10. Replit Par Kya NAHI Kar Sakte

- ❌ Android APK build (`./gradlew assembleDebug`) — Android SDK + Java missing
- ❌ `npx cap sync android` — Android folder usable nahi
- ❌ iOS build — Mac chahiye
- ❌ Supabase Edge Functions deploy — Lovable platform automatic karta hai

**APK chahiye to:**
- GitHub Actions: push karte hi `.github/workflows/build-apk.yml` chalega
- Local machine: `bash scripts/build-apk-local.sh`

---

## 📋 Summary (TL;DR)

Replit par sirf **3 steps**:

```bash
# Step 1: Install dependencies
npm install --legacy-peer-deps --no-audit --no-fund

# Step 2: Replit Secrets tab me add karein:
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_PUBLISHABLE_KEY
#   VITE_SUPABASE_PROJECT_ID

# Step 3: Dev server start
npm run dev
```

Bas! Web preview chalu ho jayega. 🚀
