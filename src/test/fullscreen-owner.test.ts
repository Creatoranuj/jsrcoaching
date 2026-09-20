import { describe, it, expect, vi, beforeEach } from "vitest";

const hideStatusBar = vi.fn(async () => {});
const showStatusBar = vi.fn(async () => {});
const enterImmersive = vi.fn();
const exitImmersive = vi.fn();

vi.mock("../lib/nativeChrome", () => ({
  hideStatusBar: (...a: unknown[]) => hideStatusBar(...(a as [])),
  showStatusBar: (...a: unknown[]) => showStatusBar(...(a as [])),
}));
vi.mock("../lib/androidImmersive", () => ({
  enterImmersive: () => enterImmersive(),
  exitImmersive: () => exitImmersive(),
}));
vi.mock("../lib/native/app", () => ({
  loadCapacitorApp: async () => {
    throw new Error("no native app plugin in tests");
  },
}));

import {
  enterFullscreen,
  exitFullscreen,
  isFullscreenActive,
  isDeepFullscreenActive,
  resetFullscreen,
} from "../lib/native/fullscreen";

describe("native fullscreen owner set", () => {
  beforeEach(() => {
    resetFullscreen();
    hideStatusBar.mockClear();
    showStatusBar.mockClear();
    enterImmersive.mockClear();
    exitImmersive.mockClear();
  });

  it("hides chrome for the first owner", () => {
    enterFullscreen("video", true);
    expect(isFullscreenActive()).toBe(true);
    expect(isDeepFullscreenActive()).toBe(true);
    expect(hideStatusBar).toHaveBeenCalledTimes(1);
    expect(enterImmersive).toHaveBeenCalledTimes(1);
  });

  it("keeps chrome hidden until the last owner exits", () => {
    enterFullscreen("reader", true);
    enterFullscreen("video", true);
    showStatusBar.mockClear();

    exitFullscreen("video");
    expect(showStatusBar).not.toHaveBeenCalled();
    expect(isFullscreenActive()).toBe(true);

    exitFullscreen("reader");
    expect(showStatusBar).toHaveBeenCalledTimes(1);
    expect(isFullscreenActive()).toBe(false);
  });

  it("does not double-count the same owner", () => {
    enterFullscreen("reader");
    enterFullscreen("reader");
    exitFullscreen("reader");
    expect(isFullscreenActive()).toBe(false);
  });

  it("drops deep immersive when only a shallow owner remains", () => {
    enterFullscreen("reader", false);
    enterFullscreen("video", true);
    exitImmersive.mockClear();

    exitFullscreen("video");
    expect(isFullscreenActive()).toBe(true);
    expect(isDeepFullscreenActive()).toBe(false);
    expect(exitImmersive).toHaveBeenCalled();
    expect(showStatusBar).not.toHaveBeenCalled();
  });
});
