---
name: soft-touch
description: Add subtle haptic + micro-animation polish ("soft touch") to interactive elements in the Naveen Bharat Capacitor APK so taps feel premium, responsive, and physical. Use whenever the user asks to make the app "feel softer", "feel more native", "add polish", "less janky", "more responsive", or wants haptics/animation on buttons, list rows, tabs, toggles, or sheets.
---

# Soft Touch — APK Polish Playbook

A "soft touch" is the sub-100ms physical confirmation a native app gives on every tap:
**haptic pulse + visual press state + spring-out**. Web buttons feel dead on Android
because they have none of these. This skill applies them consistently.

## The Three Layers (apply in this order)

1. **Haptic** — `tapHaptic('light')` on the press handler. No-ops on web.
2. **Press state** — `active:scale-[0.97] active:opacity-90 transition-transform duration-150 ease-out` on the element.
3. **Mount animation** (only for new content) — `animate-fade-in` (already in `tailwind.config.ts`).

Never add all three to every element. Map intent → layers:

| Element                   | Haptic       | Press state | Mount anim |
| ------------------------- | ------------ | ----------- | ---------- |
| Primary CTA / submit      | `light`      | yes         | —          |
| Nav item / list row       | `selection`  | yes         | —          |
| Tab switch                | `selection`  | yes         | fade-in    |
| Toggle / switch           | `light`      | —           | —          |
| Destructive (delete)      | `medium`     | yes         | —          |
| Sheet / modal open        | `light`      | —           | scale-in   |
| Long-press (e.g. context) | `heavy`      | yes         | —          |
| Pure decorative icon      | none         | none        | none       |

Haptics are **best-effort and async** — never `await` them in a click handler; the
existing `tapHaptic` already swallows errors.

## Canonical snippets (this codebase)

```tsx
import { tapHaptic, selectionHaptic } from "@/lib/native/haptics";

// 1. Primary CTA
<Button
  onClick={() => { void tapHaptic("light"); submit(); }}
  className="active:scale-[0.97] transition-transform duration-150 ease-out"
>
  Submit
</Button>

// 2. List row / nav item
<button
  onClick={() => { void selectionHaptic(); navigate(href); }}
  className="active:bg-muted/60 active:scale-[0.99] transition-all duration-150"
>
  ...
</button>

// 3. Destructive
<Button
  variant="destructive"
  onClick={() => { void tapHaptic("medium"); confirmDelete(); }}
  className="active:scale-[0.96] transition-transform duration-150"
>
  Delete
</Button>
```

## Hard rules — never violate

- **Do NOT** use `duration-[120ms]` or other arbitrary `ms` values — they emit a
  Tailwind ambiguity warning. Use `duration-100 / 150 / 200` tokens.
- **Do NOT** call haptics inside `useEffect`, `setInterval`, or scroll handlers.
  Android throttles vibrator API and it feels broken. Haptics fire only on a
  direct user gesture (click, touchend).
- **Do NOT** add `active:scale-*` to elements with `position: fixed` children or
  to scroll containers — it triggers layout thrash on Android WebView.
- **Do NOT** import `@capacitor/haptics` directly — always go through
  `@/lib/native/haptics`. The wrapper handles the web no-op + lazy import that
  keeps haptics out of the initial bundle.
- **Do NOT** add micro-animations to the player chrome — `useAutoHideControls`
  owns visibility and any extra transform breaks the rotation-aware gesture math
  (see `capacitor-video-player-master` skill).

## When the user says "make X softer"

1. Identify the gesture: tap / swipe / long-press / toggle.
2. Pick the row from the table above.
3. Apply only the layers that row lists. Stop.
4. Verify on the route: `route → tap → expect haptic + visible press + release`.

## Done when

- Touched elements have predictable, consistent press feedback.
- No new `duration-[Nms]` arbitrary values introduced.
- `bun run build` is clean (no Tailwind ambiguity warnings).
- Closing reply mentions: "Used the soft-touch skill."
