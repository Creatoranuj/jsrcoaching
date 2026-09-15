/**
 * Wraps any fixed-bottom region so it lifts above the soft keyboard.
 *
 * Uses `--nb-keyboard-h` (set by installKeyboardInsetTracker) and falls back
 * to the safe-area bottom inset when the keyboard is closed.
 *
 * Why a component (not just a Tailwind class):
 *   - Keeps the keyboard contract in ONE place — if we rename the CSS var
 *     later, only this file changes.
 *   - Composes with any child (forms, footers, CTAs, sticky tab bars).
 */
import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Extra px added on top of the keyboard / safe-area inset. */
  gap?: number;
}

export function KeyboardSafeArea({ children, gap = 0, className, style, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={cn("w-full", className)}
      style={{
        paddingBottom: `calc(max(env(safe-area-inset-bottom), var(--nb-keyboard-h, 0px)) + ${gap}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default KeyboardSafeArea;
