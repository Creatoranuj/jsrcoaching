# Screen Protection Matrix — Verification Report

**Date:** 2026-07-20
**Scope:** FLAG_SECURE (Android) via `@capacitor-community/privacy-screen`
**Verdict:** ✅ **PASS** — behavior matches intent. Admin bypassed everywhere; student blocked only on `LessonView`. No leaks found.

---

## Intent (recap)

| Role    | LessonView                      | All other pages                 |
| ------- | ------------------------------- | ------------------------------- |
| Admin   | Screenshot / record **allowed** | Screenshot / record **allowed** |
| Student | Screenshot / record **blocked** | Screenshot / record **allowed** |

Admin can optionally opt back **in** to protection (per-device) via Admin → Security.

---

## Actual Matrix (verified against code)

| Route / Surface                     | Guard call site                             | Admin (default) | Admin (opt-in) | Student           |
| ----------------------------------- | ------------------------------------------- | --------------- | -------------- | ----------------- |
| `/` Dashboard, Home                 | none                                        | ✅ allowed      | ✅ allowed     | ✅ allowed        |
| `/courses`, `/my-courses`           | none                                        | ✅ allowed      | ✅ allowed     | ✅ allowed        |
| `/books`, `/downloads`, `/profile`  | none                                        | ✅ allowed      | ✅ allowed     | ✅ allowed        |
| `/notices`, community, chatbot      | none                                        | ✅ allowed      | ✅ allowed     | ✅ allowed        |
| `/admin/*` (all admin panels)       | none                                        | ✅ allowed      | ✅ allowed     | n/a (route-gated) |
| **`/lesson/:id` (LessonView)**      | `useScreenProtection(true)` → line 105      | ✅ allowed      | 🔒 blocked     | 🔒 **blocked**    |

Grep confirms **`useScreenProtection` is called in exactly one page**: `src/pages/LessonView.tsx:105`. `useProtectedSurface` is exported from `src/lib/safety/index.ts` but has **zero external consumers** — no other page opts in.

---

## Code trace

### 1. Native default — OFF
`capacitor.config.ts:55-63`
```ts
PrivacyScreen: {
  enable: false,   // native default disabled — JS owns the state
}
```

### 2. Boot baseline — routed via `reconcile()`
`src/main.tsx:320`
```ts
import("./hooks/useScreenProtection").then((m) => m.bootstrapScreenProtection())
```
`src/hooks/useScreenProtection.ts:156-159`
```ts
export async function bootstrapScreenProtection() {
  await loadPlugin();
  await reconcile();   // NOT plugin.disable() — race-safe
}
```
Race prior to this fix: boot fired `plugin.disable()` after a deep-linked `LessonView` had already called `enable()`, stripping FLAG_SECURE. Now `reconcile()` reads `activeCount` and only disables when no protected surface is mounted.

### 3. Role fail-safe
`useScreenProtection.ts:67-75` — `shouldBeEnabled()`:
- `activeCount === 0` → OFF (no protected page mounted)
- `!roleResolved` → ON (unknown role treated as student until `has_role` RPC returns)
- `isAdminFlag && !adminProtectionOptIn` → OFF (admin bypass)
- else → ON (student on protected surface)

### 4. Admin opt-in surface
`src/pages/AdminSecurity.tsx:14` — only reads/writes `useAdminScreenProtectionOptIn()`; the setter is guarded by admin-route access, so students cannot flip the bypass.

### 5. Detection-only
`src/hooks/useScreenCaptureDetection.ts:33` — reads `PrivacyScreen` to subscribe to capture events; does **not** call `enable()`/`disable()`. Safe.

---

## Race-condition traces

| Scenario                                                   | Expected              | Traced result |
| ---------------------------------------------------------- | --------------------- | ------------- |
| Cold start → Home                                          | Student OFF, Admin OFF | ✅            |
| Cold start → deep-link `/lesson/:id`                       | Student ON, Admin OFF | ✅ (bootstrap `reconcile()` respects `activeCount` incremented by LessonView mount) |
| LessonView → Back to Home                                  | OFF for both          | ✅ (cleanup decrements `activeCount` → reconcile disables) |
| Home → LessonView (student)                                | ON                    | ✅            |
| LessonView → LessonView (route swap)                       | ON throughout         | ✅ (ref-count stays ≥ 1) |
| Admin toggles opt-in ON while inside LessonView            | ON                    | ✅ (`setAdminScreenProtectionOptIn` → reconcile) |
| Role RPC delayed 500ms, student opens LessonView           | ON during delay, ON after | ✅ (fail-safe: `!roleResolved` → ON) |

---

## APK re-test checklist (physical device)

1. **Cold start → Home** → try screenshot → **should succeed** (student & admin).
2. **Open any lesson → try screenshot** → student: black frame / blocked toast; admin: succeeds.
3. **From lesson → press Back → Home → screenshot** → succeeds for both.
4. **Deep-link into a lesson** (`adb shell am start -a android.intent.action.VIEW -d "safarenglish://lesson/<id>"`) → student screenshot blocked immediately.
5. **Admin → Settings → Security → toggle "Enable screen protection"** → open lesson → screenshot blocked. Toggle off → allowed again.

`adb` sanity:
```bash
adb shell dumpsys window | grep -i "FLAG_SECURE\|Secure"
```
Expect: flag present only while a lesson is foreground for a student (or admin with opt-in).

---

## Findings

None. Whitelist is minimal (1 surface, 1 bypass toggle). No stray `plugin.enable()` calls, no direct `PrivacyScreen.enable()` outside the hook, no additional pages calling `useScreenProtection` or `useProtectedSurface`.

## Wins

- Fail-safe defaults during role-resolution gap.
- Ref-counted so nested/duplicate mounts can't desync.
- Boot delegates to `reconcile()` — eliminated the deep-link race.
- Admin bypass persisted per-device, reversible from admin UI.

## Open items (backlog, not blockers)

- Consider a Sentry breadcrumb on every `reconcile()` transition to make regressions observable in prod.
- iOS equivalent (screen capture detection) uses a different plugin API — out of scope for this Android-focused audit.
