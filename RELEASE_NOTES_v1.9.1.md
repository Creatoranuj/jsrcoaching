# v1.9.1 — 2026-09-20

## Payments / UPI
- Razorpay UPI tiles (PhonePe / Google Pay / Paytm / BHIM) ab WebView popups se
  seedhe UPI app me khulte hain (`onCreateWindow` probe + central `routeUrl()`).
- Checkout par UPI-first wording: "UPI ke liye website se payment karein",
  neeche ghost option "Ya sidha browser checkout kholein (card/netbanking)".
- Payment diagnostics panel sirf admin / test mode me dikhta hai.

## Security
- `content` storage bucket ab private; sirf `courses/`, `thumbnails/`,
  `hero-banners/`, `chapter-icons/`, `banners/` prefixes anon-readable
  (`content_presentation_read`). Gated lesson/material files signed-only.
- `razorpay_payments.razorpay_payment_id` par unique index — replayed payment
  se duplicate row impossible.
- `materials` SELECT ab admin/teacher, free course, ya active enrollment tak
  seemit (legacy "any authenticated user" policy hataa di).
- Migration: `supabase/migrations/20260920120000_content_bucket_private.sql`
  (production me chalani hai).

## Reliability
- Stuck payments ka auto-sweep GitHub OIDC se (legacy cron secret fallback).
- Har naye APK par Admin → App Releases me row apne aap ban jaati hai.

## AI / Ask Doubt
- Lovable AI Gateway key + `google/gemini-3.6-flash` live verify kiya — healthy.
- Auth failure ab terminal (retry nahi), transient failures par hi bounded retry;
  per-user rate limit 15/min.

## Verification
- vitest: 812 passed | 17 skipped (98 files)
- `bun run build`: green
- `npx cap sync android`: clean, 20 Capacitor plugins detected
