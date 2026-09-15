---
name: safe-surface-handling
description: Scaffolding for protected surfaces (paid video, DRM PDF, exam). Use whenever adding a page that must apply FLAG_SECURE, respect admin bypass, and guard async state safely.
---

# Safe Surface Handling

Reusable "safety kit" so every protected surface in this app inherits the same guarantees. Do not hand-roll `useScreenProtection` + mount guards + error boundary each time — compose the kit.

## When to use

- New route or component that shows paid/DRM/exam content.
- Refactoring a page that currently reads `useScreenProtection` directly.
- Any surface where a leaked frame (screenshot / recording) would be a business problem.

## The 6 non-negotiables

1. **Role-gated protect** — protection defaults ON until `AuthContext.roleLoaded` is true. Never assume "no role yet = student".
2. **Ref-counted plugin** — a single module-level count decides FLAG_SECURE; multiple mounts must not race the plugin.
3. **Admin bypass is opt-in per device** — persisted in `localStorage` (`nb_admin_screen_protection_enabled`), toggled from `/admin/security`. Never store roles in `localStorage`.
4. **Mount-guarded async setters** — wrap every post-`await` `setState` with `if (!isMountedRef.current) return;`.
5. **Skeleton, not spinner** — use `SafeBoundary` (Suspense + ErrorBoundary + skeleton) at the route or heavy-section level.
6. **Theme tokens on CTAs** — `bg-primary`/`text-primary-foreground`, never `text-white` or hardcoded gradients on locked/buy states.

## Canonical usage

```tsx
import { useProtectedSurface, SafeBoundary } from "@/lib/safety";

function LessonPage() {
  const { isMountedRef } = useProtectedSurface();

  useEffect(() => {
    (async () => {
      const data = await fetchLesson();
      if (!isMountedRef.current) return;
      setLesson(data);
    })();
  }, []);

  return <SafeBoundary fallbackTitle="Lesson failed to load">{/* ... */}</SafeBoundary>;
}
```

Disable protection deliberately (e.g. public preview):

```tsx
useProtectedSurface({ protect: false });
```

## Anti-patterns to flag

- `useScreenProtection(true)` called before role resolves without fail-safe → brief bypass window.
- Storing `isAdmin` in `localStorage` and reading it to gate protection → privilege escalation.
- `const [x, setX] = useState(); await fetch(); setX(...)` with no unmount check.
- Full-page spinner instead of skeleton matching final layout.
- `bg-gradient-to-r from-orange-500 to-red-600 text-white` on Buy/Locked CTAs.
- Duplicating pdf.js extraction inline instead of a shared helper.
- `key={index}` on reordered protected lists.
- Static plugin imports for `@capacitor-community/privacy-screen` without `.catch(() => null)` web fallback.

## Verify checklist

- [ ] `useProtectedSurface` (not raw `useScreenProtection`) used on the page.
- [ ] Every `await` inside `useEffect` guarded by `isMountedRef` or an `AbortController`.
- [ ] Wrapped in `<SafeBoundary/>` at route or heavy-section level.
- [ ] No `text-white` / hardcoded hex on primary CTAs.
- [ ] Admin toggle in `/admin/security` still turns protection ON/OFF for this surface (manual smoke).
- [ ] `tsgo --noEmit` clean.

## Files

- `src/lib/safety/useProtectedSurface.ts` — the composed hook.
- `src/lib/safety/useIsMountedRef.ts` — mount guard primitive.
- `src/lib/safety/SafeBoundary.tsx` — ErrorBoundary + Suspense + skeleton.
- `src/hooks/useScreenProtection.ts` — underlying ref-counted FLAG_SECURE plugin wrapper (do not call directly from new code).
- `docs/SAFETY-KIT.md` — one-page adoption guide.
