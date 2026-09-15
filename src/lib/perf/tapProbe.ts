/**
 * Lightweight perf probe for the video-player tap-toggle pipeline.
 *
 * Records `performance.now()` deltas between the four checkpoints that
 * determine perceived responsiveness:
 *
 *   touchstart → toggleControlsSoft → setShowControls (commit) → immersive bridge
 *
 * Target: end-to-end < 20ms in a release APK.
 *
 * Usage:
 *   tapProbe.mark("touchstart");
 *   tapProbe.mark("toggle");
 *   tapProbe.mark("commit");      // fired from the showControls effect
 *   tapProbe.mark("immersive");   // fired from the immersive effect
 *
 * The last completed cycle is exposed on `window.__nbTapProbe` for
 * debug-build inspection (`adb shell ... | grep nb-tap-probe`).
 * Disabled in production builds.
 */
type Checkpoint = "touchstart" | "toggle" | "commit" | "immersive";

interface Cycle {
  startedAt: number;
  marks: Partial<Record<Checkpoint, number>>;
  deltas: Partial<Record<Exclude<Checkpoint, "touchstart">, number>>;
  total?: number;
}

const enabled =
  typeof import.meta !== "undefined" &&
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

let current: Cycle | null = null;

function publish(cycle: Cycle) {
  if (typeof window === "undefined") return;
  (window as unknown as { __nbTapProbe?: Cycle }).__nbTapProbe = cycle;
  // One concise line so logcat scrubs are easy: `adb logcat | grep nb-tap-probe`.
   
  console.info("[nb-tap-probe]", JSON.stringify(cycle.deltas), "total=", cycle.total?.toFixed(1));
}

export const tapProbe = {
  mark(point: Checkpoint) {
    if (!enabled) return;
    const now = performance.now();
    if (point === "touchstart") {
      current = { startedAt: now, marks: { touchstart: now }, deltas: {} };
      return;
    }
    if (!current) return;
    current.marks[point] = now;
    current.deltas[point] = +(now - current.startedAt).toFixed(1);
    if (point === "immersive") {
      current.total = +(now - current.startedAt).toFixed(1);
      publish(current);
      current = null;
    }
  },
  /** Read-only snapshot for tests. */
  _current() {
    return current;
  },
};