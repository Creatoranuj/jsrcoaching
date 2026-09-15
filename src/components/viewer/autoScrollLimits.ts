/**
 * Shared autoscroll limits.
 *
 * Lives in its own module so `AutoScrollFab` can re-export `MAX_SPEED` without
 * statically importing the (lazily loaded) settings sheet.
 */

/** Fastest autoscroll step, in px per animation frame. */
export const MAX_SPEED = 20;
