---
name: capacitor-core
description: Rules for building production-grade Capacitor + React + Supabase EdTech mobile apps. Use when working on the mobile shell, 60fps performance, hardware back-button, safe-area/keyboard, Supabase edge function security, anti-piracy for video/PDF, offline resilience, or payment state sync. Bundles Safe Area, Keyboard, Security, Webapp-to-Capacitor, Debugging, and Accessibility references.
---

# Capacitor Core — EdTech Mobile Build Rules

Principal mobile architect rules for this React + TypeScript + Tailwind + Capacitor + Supabase app. Apply on every mobile/perf/security task.

## Companion references (read on demand)

- `references/safe-area.md` — notch, Dynamic Island, home indicator, Android cutouts.
- `references/webapp-to-capacitor.md` — store-readiness, thin-wrapper rejection avoidance.
- `references/debugging.md` — WebView/native debug, logcat, Safari inspector.
- `references/accessibility.md` — screen readers, touch targets, contrast, focus.

Also load when relevant: built-in `safe-area-handling`, `capacitor-keyboard`, `capacitor-security`, `webapp-to-capacitor` skills.

## 1. Zero-lag performance (60fps mandatory)

- Memoize expensive computations with `useMemo`; stable callbacks with `useCallback`. No inline object/array props on hot lists.
- Route-level `React.lazy()` + `<Suspense>` (see `src/App.tsx` pattern). Eager-load only critical-path pages.
- Virtualize any list >50 rows (`react-window` / `@tanstack/react-virtual`).
- Keep dependencies minimal — every new dep must justify bundle cost.
- **WebView memory management:** Heavy components (Video.js, PDF.js, Bunny player) MUST be unmounted on route exit. Revoke every `URL.createObjectURL` via `URL.revokeObjectURL` in a `useEffect` cleanup. Detach video `src`, call `.pause()` + `.load()` on unmount. Android low-end WebViews crash without this.
- **Supabase free-tier shielding:** Never query DB on every page load for static content. Use React Query with `staleTime` up to 24h for catalog/landing data. Batch high-frequency mutations (video progress, watch heartbeats) — flush on unmount or fixed intervals, never per-tick.

## 2. Native hardware back-button — strict priority stack

Canonical implementation: `src/hooks/useAndroidBackButton.ts` + `src/contexts/NavigationHistoryContext.tsx`. Extend, do not replace.

Priority order on every `backButton` event:
1. **Dismiss soft keyboard** if visible (`Keyboard.hide()`).
2. **Exit fullscreen** for PDF / video player (check `window.history.state?.pdfFullscreen`, video fullscreen API).
3. **Close topmost modal / Dialog / Sheet / Drawer** before any navigation.
4. **Pop React Router history** via `NavigationHistoryContext.peekPrevious()`; fall back to route-aware parent map.
5. **Double-tap exit** only on root routes (`/dashboard`, `/`) and auth routes — show toast first, `App.exitApp()` on second tap within 2s.

Never call `App.exitApp()` from a non-root route. Never let the OS default close the app.

## 3. Supabase edge function security & speed

- Validate JWT in every protected function with `supabase.auth.getClaims(token)`. Reject missing/invalid `Authorization: Bearer` immediately.
- RLS-first: assume the function is one defence layer; tables must enforce ownership via `auth.uid()` + `user_roles` (never roles on profiles).
- Sanitize all inputs (length caps, type checks, zod). Reject unknown fields.
- Fast cold start: minimal imports, no top-level heavy SDK init, reuse clients across invocations.
- **Never** ship `service_role_key` to the frontend or accept it as a caller token. Access internally via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` only when bypassing RLS is intentional.
- Wrap every external call (Razorpay, Bunny, Zoom, AI gateway) in try/catch; return structured `{ error, code }` JSON with proper HTTP status. Frontend must degrade gracefully.

## 4. Native UI resilience

- `<meta viewport-fit=cover>` is mandatory. All fixed headers/footers use `env(safe-area-inset-*)`.
- Inputs must stay visible above the keyboard — use `@capacitor/keyboard` `keyboardWillShow` listener and CSS `--keyboard-height` var on chat/forms.
- Every async surface ships a **skeleton** (`src/components/ui/skeleton.tsx`) — never a blank screen or spinner-only.
- Every list/data view ships explicit **empty state** and **error state** components with retry CTA.
- Tap targets ≥ 44×44 CSS px. Contrast ≥ 4.5:1 in both themes.

## 5. EdTech security & offline resilience

- **Anti-piracy (FLAG_SECURE):** Any route rendering protected video or PDF MUST enable Android `FLAG_SECURE` on mount and disable on unmount. Bridge via a Capacitor plugin or custom MainActivity method; document the bridge name when added. Blocks screen recording / screenshots on Android. (iOS: overlay blur on `applicationWillResignActive`.)
- **Offline fallbacks:** Wrap dashboard/course initial loads in try/catch. On `@capacitor/network` `getStatus().connected === false`, serve React Query offline cache and show a `sonner` toast — never a raw error screen. Login screen must detect offline and message clearly.
- **Payment state truth:** Razorpay client `handler` success is NOT proof of payment. UI enrollment unlocks only after Supabase webhook (`razorpay-webhook` edge function) writes the enrollment row. `PaymentCallback` polls/realtime-subscribes to that row — never trusts client state alone.
- **Refunds & disputes:** Mirror the same webhook-first rule for `razorpay-refund-webhook`.

## 6. Build phase checklist

- **Phase 1 — Foundation:** layout shell, back-button hook, Supabase client, theme, safe-area, skeleton primitives.
- **Phase 2 — Core features:** screens with lazy routes, React Query caching, virtualized lists, skeleton + empty + error states.
- **Phase 3 — Backend & polish:** RLS audit, edge function JWT validation, webhook-driven payments, FLAG_SECURE on protected routes, offline fallbacks, store-readiness pass via `references/webapp-to-capacitor.md`.

## Project-specific anchors

- Back button: `src/hooks/useAndroidBackButton.ts`, `src/contexts/NavigationHistoryContext.tsx`
- Routing & lazy split: `src/App.tsx`
- Supabase client: `src/integrations/supabase/client.ts`
- Capacitor config: `capacitor.config.ts`
- Skeleton primitive: `src/components/ui/skeleton.tsx`
- Edge functions: `supabase/functions/*`

Do not duplicate these — extend them.