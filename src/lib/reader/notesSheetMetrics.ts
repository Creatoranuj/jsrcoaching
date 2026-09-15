/**
 * Geometry for the reader's notes sheet.
 *
 * The sheet is anchored above the soft keyboard, so its height is derived from
 * the keyboard inset. Two things must never happen:
 *
 *  1. The sheet collapses to (near) zero — on some Android WebViews the
 *     reported inset briefly approaches the full viewport height while the
 *     keyboard animates, which would leave a 0px writing surface.
 *  2. The sheet grows taller than the space actually left above the keyboard.
 *
 * Keeping the maths here (instead of inline in the component) means the
 * no-collapse guarantee is unit-testable.
 */

/** Never render the sheet shorter than this, whatever the keyboard reports. */
export const MIN_SHEET_HEIGHT = 220;

/** Breathing room between the sheet and the keyboard / screen bottom. */
const GAP = 12;

/** Resting height when no keyboard is up (fraction of the viewport). */
const RESTING_RATIO = 0.7;

export interface NotesSheetMetrics {
  /** Distance from the bottom of the layout viewport, in px. */
  bottom: number;
  /** Sheet height in px. */
  height: number;
}

/**
 * @param viewportHeight Layout viewport height in px (`window.innerHeight`).
 * @param keyboardInset  Height covered by the keyboard in px (0 when closed).
 */
export function notesSheetMetrics(viewportHeight: number, keyboardInset: number): NotesSheetMetrics {
  const vh = Math.max(0, Math.round(viewportHeight)) || MIN_SHEET_HEIGHT;
  const inset = Math.max(0, Math.round(keyboardInset));

  // A sane keyboard never covers more than ~70% of the screen; anything beyond
  // that is a transient measurement and must not shrink the writing surface.
  const cappedInset = Math.min(inset, Math.round(vh * 0.7));

  const available = vh - cappedInset - GAP;
  const desired = inset > 0 ? available : Math.round(vh * RESTING_RATIO);

  // Clamp to the floor, but never taller than the viewport itself.
  const height = Math.min(Math.max(desired, MIN_SHEET_HEIGHT), vh);

  return { bottom: cappedInset, height };
}
