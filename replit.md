# Safar English — Education Platform

## Overview
Capacitor + React + Vite EdTech app ("Mahima Academy") targeting NEET & Class 9–12 students. Runs as a web app on Replit and as a native Android APK via Capacitor.

## Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js (`server/index.js`) serving Vite in dev, static dist in prod
- **Database / Auth**: Supabase (URL + anon key hardcoded in `src/integrations/supabase/client.ts`; service-role key via env var for server)
- **Mobile**: Capacitor v7 (Android project in `./android/`)
- **Payments**: Razorpay
- **Custom plugin**: `capacitor-plugin-nb-pdf` (local)

## How to run

```bash
npm install          # install dependencies
npm run dev          # starts Express + Vite dev server on port 5000
```

The workflow "Start application" runs `npm run dev` and maps port 5000 → external port 80.

## Environment variables (already configured in .replit)
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `VITE_SUPABASE_URL` | Same URL, exposed to Vite frontend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same anon key, exposed to Vite frontend |
| `SESSION_SECRET` | Express session signing (Replit Secret) |
| `PORT` | Server port (default 5000) |

Optional:
- `SUPABASE_SERVICE_ROLE_KEY` — needed for admin server routes
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — needed for payment endpoints
- `GEMINI_API_KEY` — AI features
- `VITE_SENTRY_DSN` — Sentry error tracking (production only)

## Build for production
```bash
npm run build        # Vite build + bundle-size checks
node server/index.js # serves dist/ in production mode
```

## Android APK
See `APK_BUILD_GUIDE.md` and `CAPACITOR.md` for details.
```bash
npm run build
npx cap sync
npx cap open android   # opens Android Studio
```

## User preferences
- Keep existing project structure — do not restructure or migrate.
