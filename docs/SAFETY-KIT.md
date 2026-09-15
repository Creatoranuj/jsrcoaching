# Safety Kit — Protected Surfaces

One-page reference for adding a protected surface (paid video, DRM PDF, exam page).

## What's in the kit

| File | Purpose |
| --- | --- |
| `src/lib/safety/useProtectedSurface.ts` | Composed hook: FLAG_SECURE (role-gated, admin-bypass aware) + `isMountedRef`. |
| `src/lib/safety/useIsMountedRef.ts` | Mount-guard ref for post-`await` setters. |
| `src/lib/safety/SafeBoundary.tsx` | `ErrorBoundary + Suspense + Skeleton` wrapper. Never a bare spinner. |
| `src/hooks/useScreenProtection.ts` | Underlying ref-counted plugin wrapper. Do **not** call directly from new code. |
| `.agents/skills/safe-surface-handling/SKILL.md` | Skill that surfaces this kit to future agent turns. |

## Adopt in 3 lines

```tsx
import { useProtectedSurface, SafeBoundary } from "@/lib/safety";

export default function Page() {
  const { isMountedRef } = useProtectedSurface();
  return <SafeBoundary>{/* content */}</SafeBoundary>;
}
```

Guard async setters:

```tsx
const data = await fetch(...);
if (!isMountedRef.current) return;
setState(data);
```

## Admin behaviour (unchanged)

- Default: admins **bypass** FLAG_SECURE — they can screen-record to demo.
- `/admin/security` → "Enable FLAG_SECURE on this device" toggle switches protection back ON for that specific device.
- Non-admins are **never** bypassed.
- Fail-safe: until `AuthContext.roleLoaded` is true, protection stays ON — no brief bypass window for admins mid-boot.

## Audit checklist (paste into PR description)

- [ ] Uses `useProtectedSurface`, not raw `useScreenProtection`.
- [ ] Every `await` inside effects guarded by `isMountedRef` or an abort signal.
- [ ] Rendered inside `<SafeBoundary/>`.
- [ ] CTAs use `bg-primary` / `text-primary-foreground` tokens (no `text-white`, no hardcoded gradients).
- [ ] Sticky/fixed children use `.safe-area-*` utilities.
- [ ] Admin toggle still turns protection ON/OFF (manual smoke on `/admin/security`).

## Related migrations (surface for approval)

Explicit GRANTs for the two tables the audit flagged as running on default privileges:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_pdfs TO authenticated;
GRANT ALL ON public.lesson_pdfs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_progress TO authenticated;
GRANT ALL ON public.user_progress TO service_role;
```

Run in the Supabase SQL editor when convenient — additive, no breaking effect.
