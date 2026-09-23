import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initAppUpdatePrompt,
  isCapacitorShell,
  promptAppUpdate,
  resetAppUpdatePrompt,
  shouldPromptOnControllerChange,
} from "@/lib/appUpdate";

describe("appUpdate", () => {
  beforeEach(() => resetAppUpdatePrompt());
  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    vi.restoreAllMocks();
  });

  it("recognises the Capacitor native shell only when the bridge says native", () => {
    expect(isCapacitorShell(undefined)).toBe(false);
    expect(isCapacitorShell({})).toBe(false);
    expect(isCapacitorShell({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(isCapacitorShell({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
    expect(
      isCapacitorShell({
        Capacitor: {
          isNativePlatform: () => {
            throw new Error("bridge gone");
          },
        },
      }),
    ).toBe(false);
  });

  it("does not wire the update prompt inside the APK (fixed bundle, no service worker)", () => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const add = vi.spyOn(window, "addEventListener");
    initAppUpdatePrompt();
    expect(add.mock.calls.some(([type]) => type === "vite:preloadError")).toBe(false);
  });

  it("wires the preload-failure prompt on the web", () => {
    const add = vi.spyOn(window, "addEventListener");
    initAppUpdatePrompt();
    expect(add.mock.calls.some(([type]) => type === "vite:preloadError")).toBe(true);
  });

  it("prompts once per page load", () => {
    const notify = vi.fn();
    expect(promptAppUpdate(notify, () => {})).toBe(true);
    expect(promptAppUpdate(notify, () => {})).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("passes a reload action to the notifier", () => {
    const reload = vi.fn();
    let captured: { title: string; actionLabel: string; onAction: () => void } | null = null;
    promptAppUpdate((opts) => { captured = opts; }, reload);
    expect(captured!.title).toMatch(/update available/i);
    expect(captured!.actionLabel).toBe("Reload");
    captured!.onAction();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores the first service-worker taking control", () => {
    expect(shouldPromptOnControllerChange(false)).toBe(false);
    expect(shouldPromptOnControllerChange(true)).toBe(true);
  });
});
