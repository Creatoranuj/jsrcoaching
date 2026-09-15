# Security Checklist — Secrets & Payment Flow

**Rule:** Zero secrets in frontend. All sensitive keys live only in Supabase Edge Functions (`Deno.env`).

## Frontend bundle (safe — these are publishable)

- ✅ `VITE_SUPABASE_URL`
- ✅ `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key, RLS-protected)
- ✅ `VITE_SUPABASE_PROJECT_ID`
- ✅ Razorpay **Key ID** (returned from edge function `create-razorpay-order`) — public by design

## Edge Functions only (NEVER ship to browser)

- 🔒 `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS
- 🔒 `RAZORPAY_KEY_SECRET` — used server-side to create orders + verify HMAC signatures
- 🔒 `RAZORPAY_WEBHOOK_SECRET` — used to verify Razorpay webhook signatures
- 🔒 `FIRECRAWL_API_KEY`, `LOVABLE_API_KEY`, etc.

## Razorpay payment flow (verified)

```
Frontend                 Edge Function                Razorpay
  │                            │                          │
  │── invoke create-order ────▶│                          │
  │                            │── server SDK + SECRET ──▶│
  │                            │◀──── order_id, key_id ───│
  │◀──── order_id, key_id ─────│
  │                                                       │
  │── checkout (capacitor-razorpay, key_id only) ────────▶│
  │◀───────── razorpay_payment_id + signature ────────────│
  │                                                       │
  │── invoke verify-payment ──▶│                          │
  │                            │── HMAC verify w/ SECRET  │
  │                            │── update DB (subscription/enrollment)
  │◀──────── success ──────────│
```

## Verified by grep (run anytime)

```bash
# These must return ZERO matches in src/:
rg "RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|SERVICE_ROLE_KEY" src/
```

Last audit: 2026-07-03 — clean (re-verified via `rg` in src/; zero matches for secret names).

## Account deletion (Play / App Store compliance)

- Table: `public.deletion_requests` (RLS: users see own row only; admins see all)
- Edge Function: `request-account-deletion` (validates JWT, uses service role to insert)
- UI: `src/pages/Settings.tsx` — IonAlert confirm → IonLoading → IonToast result
