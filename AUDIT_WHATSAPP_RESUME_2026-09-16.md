# Audit: Floating WhatsApp FAB + Android resume blank-screen

**Rating: 4/5 → fixed to 5/5 on both surfaces** — the FAB was duplicated and web-only;
the blank-screen-after-resume bug had no native recovery path.

## Findings — Floating WhatsApp button

### [HIGH] [MAINT] Two different FAB implementations, two different numbers
**Where:** `src/pages/Index.tsx` (inline `<a>`), `src/components/common/WhatsAppFloat.tsx`
**Why:** Homepage used `916386474017`, `WhatsAppFloat` used `917388459249` (`WhatsAppButton.WHATSAPP_NUMBER`).
Any future change had to be made twice and the two FABs drifted in size, offset and motion.
**Fix:** single `src/components/common/WhatsAppFab.tsx`; `WhatsAppFloat` is now a thin wrapper,
`Index.tsx` renders it with the exported `WHATSAPP_PHONE`. Number mismatch is now visible in one place
(both numbers retained as-is — confirm which one is correct and I will unify).

### [HIGH] [UX] `target="_blank"` dead-ends inside the Capacitor WebView
**Why:** Android WebView has no tab UI; `wa.me` in a new window can land on a blank view instead of WhatsApp.
**Fix:** on native the click is intercepted and handed to `openExternal(..., { preferWebView: false })`
(Custom Tab / system intent), which resolves `wa.me` into the installed WhatsApp app.
`com.whatsapp` is already in the manifest `<queries>`, so the intent resolves. Web builds keep plain anchor behaviour.

### [MEDIUM] [MOT] Sticky hover after tap
**Where:** old `hover:scale-105` with no hover-capability guard.
**Fix:** `[@media(hover:hover)]:hover:scale-105` + `active:scale-95`, 200ms, `motion-reduce` respected.
Added light haptic on tap (`tapHaptic`), matching the rest of the app's primary actions.

### [MEDIUM] [VIS] Collision with the bottom Login/Signup pill
**Where:** screenshot — FAB at `bottom: 5.5rem` sat level with the floating auth pill on 411px screens.
**Fix:** default offset raised to `6.5rem + env(safe-area-inset-bottom)`; `WhatsAppFloat` keeps
`9.5rem` when it must clear the sticky mobile CTA. Tap target 56px (>44px), focus ring added.

## Findings — blank screen after app switch (Android)

### [CRITICAL] [RELY] WebView renderer killed while backgrounded → permanently blank screen
**Where:** `android/app/src/main/java/com/jsrcoaching/app/MainActivity.java`
**Why:** On memory-constrained devices Android kills the WebView's *renderer* process when the app is
backgrounded. The Activity survives, so the user returns to a live window with no content **and no JS** —
`useResumeRecovery`'s rAF/chunk watchdogs die with the renderer and cannot recover anything.
Nothing overrode `onRenderProcessGone`, so the platform default left a blank view (or killed the process).
**Fix:** new `RecoveryWebViewClient extends BridgeWebViewClient` overrides `onRenderProcessGone`,
detaches and destroys the dead WebView, and relaunches `MainActivity` (CLEAR_TASK) so the bridge and
app reload from packaged assets. The user sees a short splash instead of a white screen.

### [HIGH] [RELY] JS timers left paused on some OEM skins
**Fix:** `MainActivity.onResume()` now calls `webView.onResume()` + `resumeTimers()` (idempotent, best-effort) —
covers MIUI / ColorOS / Funtouch freezing rAF and `setTimeout` after a long background stint.

### [MEDIUM] [RELY] No detection for "restored but empty" document
**Where:** `src/hooks/useResumeRecovery.ts`
**Fix:** added a 900ms blank-screen watchdog after each resume — if the React root is empty, one guarded
hard reload fires (same one-shot `sessionStorage` guard, so no reload loops).

## Wins
- `useResumeRecovery` already covered chunk errors, stale background, rAF freeze and query invalidation.
- Manifest already declares `com.whatsapp` visibility and `launchMode="singleTask"`.
- No new dependency was needed — the fix is native lifecycle handling, not a plugin.

## Verify
- `bunx tsc --noEmit` clean, `bunx vitest run` 656 passed / 17 skipped, `bun run build` green.
- Device check: open app → switch to a heavy app (camera/YouTube) → return. Expected: content intact, or a
  brief splash and full reload — never a blank screen.
