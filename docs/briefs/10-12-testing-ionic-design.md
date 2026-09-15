# Brief — Group F: Testing (#10) + Ionic Design (#12)

## #10 — Testing strategy

### Layers

| Layer | Tool | Where | Runs on |
|---|---|---|---|
| Unit | Vitest | `src/test/*.test.ts(x)` | Every push (CI) + locally |
| Component | Vitest + RTL | `src/test/components/*.test.tsx` | Every push |
| E2E (web) | Playwright | `e2e/*.spec.ts` | CI on PR |
| Edge functions | Deno test | `supabase/functions/*/replay_test.ts`, `policies_test.ts` | CI on PR |
| Native smoke | Manual matrix | `docs/STORE-READINESS.md` checklist | Pre-release |

### What to test (priority order)

1. **Money paths** — `verify-razorpay-payment`, `razorpay-webhook` (HMAC verify, replay protection). Already covered by `replay_test.ts`.
2. **RLS policies** — `supabase/functions/security-regression/policies_test.ts`. Run after every migration touching policies.
3. **Auth flow** — `e2e/auth.spec.ts` covers signup → email → login → reset.
4. **Offline-critical** — `e2e/pdf-offline.spec.ts` covers download → airplane mode → re-open.
5. **Bridge wrappers** (new from Group A) — mock `@capacitor/core` and assert `safeCall` returns the `fallback` on web.

### Plugin mocking template

```ts
// src/test/setup.ts
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
    isPluginAvailable: () => false,
  },
}));
```

### Native smoke matrix (pre-release)

Per `docs/STORE-READINESS.md`, verify on **at least one of each**: iPhone (notched), iPad, Pixel (gesture nav), low-end Android (Android 10 / 2GB RAM). Cover: cold start < 2.5s, signup → payment → enrollment, video playback in fullscreen, PDF download + offline open, deep link from email.

---

## #12 — Ionic-style design

We are intentionally **not** importing `@ionic/react`. The Tailwind + shadcn stack covers everything we need at ~40% of the bundle cost. This brief codifies how to reach Ionic-grade polish without the runtime.

### The 5 patterns Ionic gets right (and how we mirror them)

| Ionic pattern | Our equivalent |
|---|---|
| `IonHeader` with translucent blur on scroll | `<header className="sticky top-0 backdrop-blur-lg bg-background/80 border-b">` + `safe-area-top` |
| `IonTabBar` lifted above home indicator | `<KeyboardSafeArea>` wrapping the tab bar; or `pb-safe-b` |
| `IonRefresher` pull-to-refresh | Native browser overscroll on iOS + a small custom React handler on Android — see `useAutoScroll` for the scroll bridge |
| `IonActionSheet` from bottom | Radix `Sheet` with `side="bottom"`, `pb-safe-b`, drag handle div on top |
| `IonAlert` system-style confirm | `AlertDialog` from shadcn + 48px min-tap targets |

### Touch-target rule

Every interactive element ≥ **44×44 px** (Apple HIG) / **48×48 dp** (Material). Use `min-h-touch min-w-touch` if the design tokens are extended, otherwise `min-h-[44px]`.

### Motion

- Use Tailwind transitions (`transition-transform duration-200 ease-out`) for taps and modals.
- Reserve `framer-motion` for **page transitions and hero sequences only** — every other animation can live in CSS.
- Honour `prefers-reduced-motion` — wrap large animations in `motion-safe:` Tailwind variants.

### Dark mode

Already handled by the design-token system (`hsl(var(--...))` everywhere). Never hard-code `text-white` / `bg-black` in components — that's the only way dark mode stays consistent across the new and existing surfaces.

### When to reach for `@ionic/react`

Only if a future feature genuinely needs **virtualised lists with momentum** (very large feeds) or **native segment animations** that are painful to recreate. Even then, prefer `react-virtual` first; full Ionic is the last resort because it doubles the runtime cost and conflicts with shadcn's accessibility primitives.
