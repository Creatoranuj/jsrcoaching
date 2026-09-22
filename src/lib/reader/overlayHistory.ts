/**
 * Synthetic-pop marker for nested history sentinels.
 *
 * Overlays (autoscroll settings sheet, dialogs, viewers) push a history
 * sentinel so the Android hardware back button closes them instead of leaving
 * the screen. When such an overlay is closed *programmatically* (Done button,
 * backdrop tap, unmount) its cleanup calls `history.back()` to keep the stack
 * balanced. That fires a real `popstate` event which unrelated listeners
 * further down the stack — e.g. the fullscreen PDF viewer in LessonView —
 * used to read as "user pressed back", closing the PDF along with the sheet.
 *
 * `beginSyntheticPop()` marks the very next popstate as self-inflicted; any
 * listener that only cares about genuine back presses calls `isSyntheticPop()`
 * and bails out.
 *
 * The flag is cleared on the first popstate it covers, with a short timeout as
 * a safety net in case the browser never delivers one (already at the bottom
 * of the stack, blocked navigation, etc.).
 */

let syntheticDepth = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Longest we keep the flag alive without seeing a popstate (ms). */
const SYNTHETIC_TTL = 400;

const reset = () => {
  syntheticDepth = 0;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
};

/** Call immediately before a programmatic `history.back()`. */
export function beginSyntheticPop(): void {
  syntheticDepth += 1;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(reset, SYNTHETIC_TTL);
}

/**
 * True while the popstate currently being dispatched was caused by an overlay
 * closing itself. Safe to call from any number of listeners for the same event
 * — the flag is only consumed once the event has finished dispatching.
 */
export function isSyntheticPop(): boolean {
  return syntheticDepth > 0;
}

/** Test helper — drops any pending flag. */
export function resetSyntheticPop(): void {
  reset();
}

// ── Sentinel depth ─────────────────────────────────────────────────────────
//
// Every sentinel an overlay pushes is stamped with `nbDepth` = (depth of the
// entry below it) + 1. Router entries and legacy raw `pushState` calls carry no
// stamp and count as depth 0.
//
// Why: an overlay used to decide "my sentinel was popped" by checking that the
// entry the browser landed on is not its own. That reads *any* pop above it as
// its own — e.g. the autoscroll sheet closing inside the PDF reader inside the
// Downloads file viewer. With a depth stamp the outer overlay can tell that the
// pop landed on an entry still above it and stay open.

/** Depth stamped on a sentinel state; 0 for router entries / unstamped states. */
export function sentinelDepth(state: unknown): number {
  const d = (state as { nbDepth?: unknown } | null | undefined)?.nbDepth;
  return typeof d === "number" && Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * Push a history sentinel one level deeper than the current entry.
 * Returns the depth it was stamped with (pass it to `poppedAboveOrAt`).
 */
export function pushSentinel(state: Record<string, unknown>): number {
  const depth = sentinelDepth(window.history.state) + 1;
  window.history.pushState({ ...state, nbDepth: depth }, "");
  return depth;
}

/**
 * True when a popstate landed on an entry that is still at or above
 * `ownDepth` — i.e. a *nested* overlay popped, not this one.
 */
export function poppedAboveOrAt(state: unknown, ownDepth: number): boolean {
  return ownDepth > 0 && sentinelDepth(state) >= ownDepth;
}


if (typeof window !== "undefined") {
  // Consume one level *after* the current popstate has been delivered to every
  // listener, so ordering between listeners never matters.
  window.addEventListener("popstate", () => {
    if (syntheticDepth === 0) return;
    setTimeout(() => {
      syntheticDepth = Math.max(0, syntheticDepth - 1);
      if (syntheticDepth === 0 && clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
    }, 0);
  });
}
