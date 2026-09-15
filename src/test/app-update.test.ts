import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  promptAppUpdate,
  resetAppUpdatePrompt,
  shouldPromptOnControllerChange,
} from "@/lib/appUpdate";

describe("appUpdate", () => {
  beforeEach(() => resetAppUpdatePrompt());

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
