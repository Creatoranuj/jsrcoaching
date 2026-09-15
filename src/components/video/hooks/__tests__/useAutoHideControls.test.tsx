/**
 * State-machine contract for the shared video-player auto-hide hook.
 *
 * Locks the four invariants that drive the tap-toggle UX:
 *   1. kick()       → visible, timer armed only when playing+unlocked
 *   2. forceHide()  → hidden + userHidden sticky (survives lock flips)
 *   3. toggle()     → flips visibility instantly
 *   4. lock flip while userHidden=true → MUST stay hidden (the 200ms
 *      buffering blip on rotation is the canonical regression).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoHideControls } from "../useAutoHideControls";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAutoHideControls — state machine", () => {
  it("starts visible", () => {
    const { result } = renderHook(() =>
      useAutoHideControls({ isPlaying: false })
    );
    expect(result.current.visible).toBe(true);
  });

  it("forceHide() hides immediately", () => {
    const { result } = renderHook(() =>
      useAutoHideControls({ isPlaying: true, delay: 3000 })
    );
    act(() => result.current.forceHide());
    expect(result.current.visible).toBe(false);
  });

  it("kick() shows and arms auto-hide while playing+unlocked", () => {
    const { result } = renderHook(() =>
      useAutoHideControls({ isPlaying: true, delay: 1000 })
    );
    act(() => result.current.forceHide());
    act(() => result.current.kick());
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1001));
    expect(result.current.visible).toBe(false);
  });

  it("toggle() ping-pongs visible↔hidden", () => {
    const { result } = renderHook(() =>
      useAutoHideControls({ isPlaying: false })
    );
    expect(result.current.visible).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.visible).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.visible).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.visible).toBe(false);
  });

  it("transient lock flip does NOT re-show after user hide (rotation/buffering regression)", () => {
    const { result, rerender } = renderHook(
      ({ isLocked }: { isLocked: boolean }) =>
        useAutoHideControls({ isPlaying: true, isLocked, delay: 3000 }),
      { initialProps: { isLocked: false } }
    );
    act(() => result.current.forceHide());
    expect(result.current.visible).toBe(false);
    // Simulate a 200ms buffering blip flipping lock on then off
    rerender({ isLocked: true });
    expect(result.current.visible).toBe(false);
    rerender({ isLocked: false });
    expect(result.current.visible).toBe(false);
  });

  it("pause reveals chrome once but a subsequent forceHide sticks", () => {
    const { result, rerender } = renderHook(
      ({ isPlaying }: { isPlaying: boolean }) =>
        useAutoHideControls({ isPlaying }),
      { initialProps: { isPlaying: true } }
    );
    act(() => result.current.forceHide());
    rerender({ isPlaying: false });
    expect(result.current.visible).toBe(true);
    act(() => result.current.forceHide());
    expect(result.current.visible).toBe(false);
  });

  it("kick() does NOT arm timer while paused", () => {
    const { result } = renderHook(() =>
      useAutoHideControls({ isPlaying: false, delay: 500 })
    );
    act(() => result.current.kick());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.visible).toBe(true);
  });
});