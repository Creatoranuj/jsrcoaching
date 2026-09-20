/**
 * One place that owns "app chrome off / app chrome on".
 *
 * Before this module three surfaces (video player, PDF immersive reader,
 * image viewer) each called `hideStatusBar()` + `enterImmersive()` on their
 * own. Two overlapping owners (e.g. a video inside an immersive reader) meant
 * whichever one exited first restored the chrome while the other was still
 * fullscreen — and nothing re-applied immersive mode after the app came back
 * from the background, so returning to a fullscreen video showed the status
 * bar again.
 *
 * Fixes both with a reference-counted owner set plus an app-resume listener
 * that re-applies the current state.
 *
 * Every call is a safe no-op on web (the underlying helpers guard for
 * Capacitor / the Android bridge).
 */
import { hideStatusBar, showStatusBar } from "../nativeChrome";
import { enterImmersive, exitImmersive } from "../androidImmersive";
import { loadCapacitorApp } from "./app";

export type FullscreenOwner = string;

type OwnerState = { deep: boolean };

const owners = new Map<FullscreenOwner, OwnerState>();
let applied: { hidden: boolean; deep: boolean } = { hidden: false, deep: false };
let resumeBound = false;

/** True while at least one surface holds fullscreen. */
export function isFullscreenActive(): boolean {
  return owners.size > 0;
}

/** True while at least one owner asked for deep (nav-bar) immersive mode. */
export function isDeepFullscreenActive(): boolean {
  for (const o of owners.values()) if (o.deep) return true;
  return false;
}

function apply(force = false) {
  const hidden = isFullscreenActive();
  const deep = isDeepFullscreenActive();
  if (!force && hidden === applied.hidden && deep === applied.deep) return;
  applied = { hidden, deep };

  if (hidden) {
    void hideStatusBar();
    if (deep) enterImmersive();
    else exitImmersive();
    return;
  }
  void showStatusBar();
  exitImmersive();
}

/**
 * Android can drop immersive flags while the app is backgrounded (and the
 * status bar reappears on resume). Re-apply whatever state we believe we are
 * in as soon as the app becomes active again.
 */
async function bindResume() {
  if (resumeBound) return;
  resumeBound = true;
  try {
    const { plugin } = await loadCapacitorApp();
    await plugin.addListener("appStateChange", ({ isActive }) => {
      if (isActive) apply(true);
    });
  } catch {
    /* web / plugin missing — nothing to re-apply */
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) apply(true);
    });
  }
}

/**
 * Claim fullscreen for `owner`. Calling twice with the same owner just
 * updates its `deep` flag — it never double-counts.
 *
 * @param deep also hide the Android navigation bar (immersive sticky).
 */
export function enterFullscreen(owner: FullscreenOwner, deep = false): void {
  owners.set(owner, { deep });
  void bindResume();
  apply();
}

/** Release `owner`'s claim. Chrome comes back only when no owner is left. */
export function exitFullscreen(owner: FullscreenOwner): void {
  if (!owners.delete(owner)) return;
  apply();
}

/** Drop every claim and restore chrome. Used on hard teardown / tests. */
export function resetFullscreen(): void {
  owners.clear();
  apply(true);
}
