---
name: lovable-design-language
description: Apply lovable.dev's visual grammar — back-button, chip filters, chat composer, tokens, motion — to any surface in this Capacitor + Tailwind + shadcn app. Use when a component needs to "feel like Lovable" or when polishing back nav, filter chips, or the chat/composer UI.
---

# Lovable Design Language — Applied

Source of truth: `/mnt/documents/lovable-design-system-spec.md` (extracted July 2026 from live lovable.dev CSS + screenshots).

## When to trigger

- "Make X look like Lovable / cleaner / more premium"
- Refactoring `BackButton`, filter chips, chat composer, segmented controls
- Adding a new page-header, empty-state, or streaming loader
- User asks for polish on the AI/chat surface

## The 4 pillars (memorize)

1. **Ghost by default, filled only on primary intent.** Nav, back, chip inactive, tool buttons — all transparent bg + `text-foreground/70` + `hover:bg-muted/60`. Fills reserve for send button (`bg-foreground text-background`) and active chip.
2. **Pill for choice, square-ish rounded for action.** `rounded-full` = chips, segmented control, send. `rounded-lg` (8px) = buttons. `rounded-2xl` (16px) = composer & message bubbles. `rounded-xl` (12px) = inputs & cards.
3. **Weight over color.** Active chip = same shape as inactive but inverted (`bg-foreground text-background`), not a color swap. Active nav item = `font-medium` + underline, not a color change.
4. **Motion is short and gentle.** `duration-150` for hover/color, `duration-200` for chevrons/segmented slide, `duration-300` for sheets. Ease `cubic-bezier(0.33,1,0.68,1)` for spring-out on nav/sheet reveals; standard ease-out for the rest.

## Component recipes (drop-in)

### Back button — ghost, muted, optical `-ml-1`

```tsx
<button
  className="inline-flex items-center gap-1.5 -ml-1 px-1.5 py-1
             rounded-lg text-sm text-foreground/70
             transition-colors duration-150
             hover:text-foreground hover:bg-muted/60
             active:bg-muted [@media(hover:none)]:active:opacity-80
             min-h-[44px] min-w-[44px] justify-center"
  aria-label="Go back"
>
  <ArrowLeft className="h-4 w-4" />
  {label && <span>{label}</span>}
</button>
```

Rules:
- Icon 16px (`h-4 w-4`), NOT 20px. 20px looks toy-app.
- Muted at rest (`text-foreground/70`), full ink on hover only.
- No border, no shadow, no filled bg.
- Touch target enforced via `min-h/min-w-[44px]` even though visual is smaller.

### Filter chip strip — pill, invert on active

```tsx
// Inactive
className="inline-flex items-center gap-1.5 px-3 h-7 rounded-full
           border border-border/60 bg-background
           text-xs text-foreground/70
           hover:bg-muted/60 hover:text-foreground
           transition-colors duration-150 whitespace-nowrap"

// Active (same shape, inverted)
className="inline-flex items-center gap-1.5 px-3 h-7 rounded-full
           bg-foreground text-background text-xs font-medium
           transition-colors duration-150 whitespace-nowrap"

// Container
className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1
           scrollbar-none [&::-webkit-scrollbar]:hidden"
```

Count badge inside chip: `ml-1.5 h-4 min-w-[1rem] px-1 rounded-full text-[10px] tabular-nums bg-muted/70` (inactive) or `bg-background/20` (active).

### Segmented control (Monthly | Yearly pattern)

```tsx
<div className="inline-flex items-center bg-muted rounded-full p-1 h-9">
  {/* Active */}
  <button className="h-7 px-3 rounded-full bg-background text-sm font-medium
                     shadow-[0_1px_2px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)]
                     transition-all duration-200">Monthly</button>
  {/* Inactive */}
  <button className="h-7 px-3 rounded-full text-sm text-foreground/60
                     hover:text-foreground/80 transition-colors duration-150">Yearly</button>
</div>
```

### Chat composer — `rounded-2xl`, single subtle outline shadow

```tsx
<div className="relative rounded-2xl bg-background overflow-hidden
                shadow-[0_0_0_1px_rgba(119,119,113,0.16),0_1px_1px_rgba(0,0,0,0.04)]
                mx-4 mb-4">
  <textarea className="w-full resize-none bg-transparent px-4 pt-3 pb-2
                       text-sm placeholder:text-foreground/40
                       min-h-[52px] max-h-[200px] focus:outline-none leading-relaxed" />
  <div className="flex items-center justify-between px-2 pb-2 pt-1 gap-2">
    {/* left tools: h-8 w-8 rounded-lg ghost */}
    {/* right send: h-8 w-8 rounded-full bg-foreground text-background */}
  </div>
</div>
```

Send button MUST be `rounded-full` and inverted — this is the single filled control.

### Message bubbles

- User: `bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%]`
- AI: `bg-muted/60 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%]` with a 24px gradient avatar dot preceding.

### Streaming loader

Three 6px dots, `animate-bounce` with `[animation-delay:0ms|150ms|300ms]`, `bg-foreground/40`. Do NOT use a spinner.

### Empty state

Gradient tile (48px, `rounded-2xl`, `from-primary via-purple-500 to-destructive`) → title `text-base font-medium` → sub `text-sm text-foreground/60`. Never a `Sparkles` icon alone (see `chat-ui-composition` — same rule).

## Motion tokens (add once to `tailwind.config.ts` when needed)

```ts
transitionTimingFunction: {
  "spring-out": "cubic-bezier(0.33, 1, 0.68, 1)",
}
```

Use `duration-150 / 200 / 300` — never arbitrary `[Nms]` (Tailwind ambiguity warning, see `soft-touch`).

## Hard rules — do NOT violate

1. Never use a `border` on a filled active chip — it doubles the outline. Invert bg/fg only.
2. Never use `text-primary` or brand color for back-button icon. Muted `text-foreground/70` only.
3. Composer send button is always `rounded-full`; every other button in the composer is `rounded-lg`. This asymmetry IS the design.
4. Chip container uses `overflow-x-auto` + hidden scrollbar — never wrap chips onto multiple rows on mobile.
5. Do NOT stack a chip icon above the label unless it's a top-level category tab (Templates page style). Inline chips are text-only or `icon + text` in a row.
6. All hover states inside a Capacitor build must be wrapped `[@media(hover:hover)]:` or use `active:` — otherwise Android WebView leaves a sticky hover after tap.
7. Pair with the `soft-touch` skill: chips get `selectionHaptic()`, send button gets `tapHaptic("light")`, back button gets `selectionHaptic()`.

## Applied in this repo

- `src/components/ui/BackButton.tsx` — ghost muted variant
- `src/components/common/FormatFilterChips.tsx` — Lovable pill invert
- Chat composer / message bubbles — see `src/components/chat/ChatWidget.tsx` (retrofit in a dedicated pass; scope was too big for a single visual sweep)

## Done when

- Touched surface passes: ghost defaults, pill choice, weight-over-color active, motion 150/200/300.
- No new arbitrary `duration-[Nms]`.
- No filled color on secondary/tool buttons.
- Closing reply names this skill.
