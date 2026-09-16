/**
 * Single source of truth for every floating action button (FAB) that can be
 * on screen at the same time.
 *
 * Why this exists: the JSR Agent chat bubble and the WhatsApp FAB both live in
 * the bottom-right column at 56px each. Before this module they were positioned
 * with hard-coded offsets in three different files (5rem, 5.5rem, 6.5rem), so on
 * the homepage and the exam landing pages they overlapped — the WhatsApp button
 * was half-hidden behind the chat bubble and taps in the overlap region landed
 * on whichever element had the higher stacking order.
 *
 * Rule: consecutive slots must be at least FAB_SIZE_REM + FAB_GAP_REM apart.
 * `src/test/fabStack.test.ts` enforces it.
 */

/** Diameter of every round FAB, in rem (56px @ 16px root). */
export const FAB_SIZE_REM = 3.5;

/** Breathing room between two stacked FABs, in rem. */
export const FAB_GAP_REM = 1;

/** Shared stacking order so overlapping never steals a tap silently. */
export const FAB_Z = 55;

/** Mobile bottom offset of the lowest FAB slot (clears the sticky CTA bar). */
export const FAB_BASE_REM = 5;

/** Desktop bottom offset of the lowest FAB slot (no sticky CTA bar there). */
export const FAB_BASE_DESKTOP_REM = 1.5;

/** Distance between two neighbouring slots. */
export const FAB_SLOT_STEP_REM = FAB_SIZE_REM + FAB_GAP_REM;

export type FabSlot = "base" | "raised";

const SLOT_INDEX: Record<FabSlot, number> = { base: 0, raised: 1 };

/** Mobile offset (rem) for a slot. */
export const fabSlotRem = (slot: FabSlot): number =>
  FAB_BASE_REM + SLOT_INDEX[slot] * FAB_SLOT_STEP_REM;

/** Desktop offset (rem) for a slot. */
export const fabSlotDesktopRem = (slot: FabSlot): number =>
  FAB_BASE_DESKTOP_REM + SLOT_INDEX[slot] * FAB_SLOT_STEP_REM;

/** CSS `bottom` value for a slot, always clearing the gesture bar. */
export const fabBottom = (slot: FabSlot | number): string => {
  const rem = typeof slot === "number" ? slot : fabSlotRem(slot);
  return `calc(${rem}rem + env(safe-area-inset-bottom, 0px))`;
};

/** CSS `bottom` value for a slot on desktop (no safe-area inset needed). */
export const fabBottomDesktop = (slot: FabSlot): string =>
  `${fabSlotDesktopRem(slot)}rem`;
