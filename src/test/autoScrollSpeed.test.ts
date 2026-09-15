import { describe, expect, it } from "vitest";

/**
 * Regression tests for the two bugs that made 0.1x / 0.2x / 0.5x / 0.75x
 * unusable. Both are pure numeric logic, mirrored here from
 * `useAutoScroll.setSpeed` and the rAF step so they can be asserted without a
 * live rAF loop.
 */

// Mirrors setSpeed's quantisation.
const quantise = (s: number) => Math.max(0.1, Math.min(10, Math.round(s * 100) / 100));

describe("autoscroll speed quantisation", () => {
  it("preserves 0.75 (the old Math.round(s*10)/10 turned it into 0.8)", () => {
    expect(quantise(0.75)).toBe(0.75);
  });

  it("keeps the low presets exact", () => {
    for (const p of [0.1, 0.2, 0.5, 0.75, 1, 1.5, 2, 3, 5]) {
      expect(quantise(p)).toBe(p);
    }
  });

  it("clamps outside the allowed range", () => {
    expect(quantise(0)).toBe(0.1);
    expect(quantise(99)).toBe(10);
  });
});

/**
 * Simulates the engine against a scroller whose `scrollTop` snaps to whole
 * device pixels on read-back — exactly what Android WebView does.
 */
function simulate(speed: number, frames: number, useFloatPosition: boolean) {
  let stored = 0; // what the element reports back (integer-snapped)
  let pos = 0;
  let acc = 0;
  for (let i = 0; i < frames; i++) {
    if (useFloatPosition) {
      pos += speed; // dt === 1 at 60fps
      stored = Math.round(pos);
    } else {
      // Old implementation: flush at >= 0.05 and destroy the remainder.
      acc += speed;
      if (acc >= 0.05) {
        const dy = acc;
        acc = 0;
        stored = Math.round(stored + dy);
      }
    }
  }
  return stored;
}

describe("sub-pixel accumulation", () => {
  it("0.1x advances ~6px per second instead of stalling at 0", () => {
    expect(simulate(0.1, 60, false)).toBe(0); // old engine: frozen
    expect(simulate(0.1, 60, true)).toBe(6); // fixed engine
  });

  it("0.2x and 0.5x also make real progress", () => {
    expect(simulate(0.2, 60, true)).toBe(12);
    expect(simulate(0.5, 60, true)).toBe(30);
  });

  it("0.75x lands between 0.5x and 1x", () => {
    expect(simulate(0.75, 60, true)).toBe(45);
  });

  it("1x and above were unaffected by the old bug", () => {
    expect(simulate(1, 60, false)).toBe(60);
    expect(simulate(1, 60, true)).toBe(60);
  });
});