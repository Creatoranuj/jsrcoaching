import { describe, it, expect } from "vitest";
import {
  FAB_GAP_REM,
  FAB_SIZE_REM,
  FAB_SLOT_STEP_REM,
  FAB_Z,
  fabBottom,
  fabBottomDesktop,
  fabSlotDesktopRem,
  fabSlotRem,
} from "@/config/fabStack";

/**
 * Regression guard for the homepage bug where the WhatsApp FAB (6.5rem) sat
 * only 1.5rem above the JSR Agent chat bubble (5rem) while both are 3.5rem
 * tall, so the WhatsApp button was half-hidden behind the chat bubble.
 */
describe("FAB stack", () => {
  it("keeps neighbouring slots at least one button apart", () => {
    expect(FAB_SLOT_STEP_REM).toBeGreaterThanOrEqual(FAB_SIZE_REM);
    expect(FAB_SLOT_STEP_REM).toBe(FAB_SIZE_REM + FAB_GAP_REM);
  });

  it("never lets WhatsApp overlap the chat bubble on mobile", () => {
    const gap = fabSlotRem("raised") - fabSlotRem("base");
    expect(gap).toBeGreaterThanOrEqual(FAB_SIZE_REM);
  });

  it("never lets WhatsApp overlap the chat bubble on desktop", () => {
    const gap = fabSlotDesktopRem("raised") - fabSlotDesktopRem("base");
    expect(gap).toBeGreaterThanOrEqual(FAB_SIZE_REM);
  });

  it("always clears the gesture bar", () => {
    expect(fabBottom("base")).toContain("env(safe-area-inset-bottom, 0px)");
    expect(fabBottom("raised")).toContain("env(safe-area-inset-bottom, 0px)");
    expect(fabBottom(7)).toBe("calc(7rem + env(safe-area-inset-bottom, 0px))");
  });

  it("exposes one shared stacking order", () => {
    expect(FAB_Z).toBe(55);
    expect(fabBottomDesktop("base")).toBe("1.5rem");
  });
});
