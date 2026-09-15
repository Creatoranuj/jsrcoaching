/**
 * Soft-touch tap-to-toggle wiring contract for the video players.
 *
 * Scope: source-level invariants only. We deliberately do NOT mount the
 * 1500-line player component — its YouTube IFrame API + Capacitor calls
 * blow up under jsdom. Instead, we assert the wiring is present in source
 * so that future refactors can't silently delete the feature.
 *
 * Players under test:
 *  - MahimaGhostPlayer  (YouTube — primary player, used by UnifiedVideoPlayer)
 *  - MahimaVideoPlayer  (HLS / direct video)
 *
 * UnifiedVideoPlayer delegates YouTube to MahimaGhostPlayer, so testing the
 * Ghost player covers the unified flow.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ghost = readFileSync(join(root, "src/components/video/MahimaGhostPlayer.tsx"), "utf8");
const native = readFileSync(join(root, "src/components/video/MahimaVideoPlayer.tsx"), "utf8");
const unified = readFileSync(join(root, "src/components/video/UnifiedVideoPlayer.tsx"), "utf8");

describe("video player — soft-touch tap-to-toggle controls", () => {
  describe("MahimaGhostPlayer (YouTube)", () => {
    it("fires instant tap-toggle on touchStart, with touchEnd as fallback", () => {
      // Phase-2 UX fix: the toggle now runs on touchStart so the ping-pong
      // feels snappy. touchEnd still calls toggleControlsSoft as a fallback
      // for paths where touchStart was suppressed (long-press cancel, etc.).
      expect(ghost).toMatch(/onTouchStart/);
      expect(ghost).toMatch(/onTouchEnd/);
      expect(ghost).toMatch(/toggleControlsSoft\(\)/);
    });

    it("suppresses the tap-toggle for swipes, double-taps, and control-area taps", () => {
      expect(ghost).toMatch(/suppressTapToggleRef/);
      expect(ghost).toMatch(/startedOnControl/);
      expect(ghost).toMatch(/wasLocked/);
    });

    it("kills the 300ms Android WebView tap-zoom delay (touchAction: manipulation)", () => {
      expect(ghost).toMatch(/touchAction:\s*['"]manipulation['"]/);
      expect(ghost).toMatch(/WebkitTapHighlightColor:\s*['"]transparent['"]/);
    });

    it("fires a light haptic on each tap (soft-touch feedback)", () => {
      expect(ghost).toMatch(/tapHaptic\(\s*["']light["']\s*\)/);
    });

    it("delegates auto-hide bookkeeping to useAutoHideControls (single source of truth)", () => {
      expect(ghost).toMatch(/useAutoHideControls/);
    });

    it("ignores synthetic mouse events after a touch so tap-to-HIDE sticks", () => {
      // Root-cause fix: touch screens fire a synthetic mousemove ~50ms after
      // touchend. Without a guard, that mousemove calls showControlsNow() and
      // instantly re-shows the chrome the user just tapped to hide (hide "does
      // nothing" while show works). The guard bails out on recent touches.
      expect(ghost).toMatch(/lastTouchAtRef/);
      expect(ghost).toMatch(/isRecentTouch\(\)/);
    });
  });

  describe("MahimaVideoPlayer (native / HLS)", () => {
    it("also uses the shared useAutoHideControls hook", () => {
      expect(native).toMatch(/useAutoHideControls/);
    });

    it("documents that tap-toggle is handled by a dedicated overlay", () => {
      // The file deliberately leaves Touch off the inner <video> and routes
      // it through an overlay div. Guarding the comment keeps the intent
      // explicit for future maintainers.
      expect(native).toMatch(/tap-toggle overlay/i);
    });
  });

  describe("UnifiedVideoPlayer wiring", () => {
    it("routes every YouTube URL through MahimaGhostPlayer (so the tap-toggle reaches users)", () => {
      expect(unified).toMatch(/isYouTube/);
      expect(unified).toMatch(/<MahimaGhostPlayer/);
    });
  });
});
