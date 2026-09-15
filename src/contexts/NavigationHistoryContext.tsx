import { createContext, useContext, useEffect, useMemo, useRef, ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Tracks the user's real navigation trail so that back buttons (Android
 * hardware back, in-app BackButton) pop the actual previous route instead of
 * relying on a hard-coded parent map. On cold-launch / deep links the stack is
 * empty and callers fall back to a sensible default.
 *
 * Correctness rules:
 *  - PUSH  → append to stack
 *  - POP   → drop the top entry (the route we're leaving) so we don't oscillate
 *  - REPLACE → swap the top entry in place
 */
interface NavHistoryAPI {
  /** Returns the previous route in the trail, or null if none. */
  peekPrevious: () => string | null;
  /** Pops the current route off the stack and returns the previous one. */
  popPrevious: () => string | null;
  /** Full snapshot of the stack (most recent last). */
  getStack: () => string[];
}

const NavigationHistoryContext = createContext<NavHistoryAPI | undefined>(undefined);

const MAX_STACK = 20;

const NOOP_API: NavHistoryAPI = {
  peekPrevious: () => null,
  popPrevious: () => null,
  getStack: () => [],
};

export const NavigationHistoryProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navType = useNavigationType(); // "PUSH" | "POP" | "REPLACE"
  const stackRef = useRef<string[]>([]);

  useEffect(() => {
    const path = location.pathname + location.search;
    const stack = stackRef.current;

    if (navType === "POP") {
      // System back can skip multiple entries (e.g. nested overlays + page).
      // Walk back until the top matches the new path, then push if missing.
      while (stack.length > 1 && stack[stack.length - 1] !== path) {
        stack.pop();
      }
      if (stack[stack.length - 1] !== path) stack.push(path);
    } else if (navType === "REPLACE") {
      if (stack.length === 0) stack.push(path);
      else stack[stack.length - 1] = path;
    } else {
      // PUSH (default)
      if (stack[stack.length - 1] !== path) {
        stack.push(path);
        if (stack.length > MAX_STACK) {
          // splice is O(n) like shift but avoids re-allocating per push when
          // the stack repeatedly hits the cap.
          stack.splice(0, stack.length - MAX_STACK);
        }
      }
    }
  }, [location.pathname, location.search, navType]);

  // Stable API reference — methods read from the ref, so the object can be
  // memoized for the lifetime of the provider.
  const api = useMemo<NavHistoryAPI>(
    () => ({
      peekPrevious: () => {
        const s = stackRef.current;
        return s.length >= 2 ? s[s.length - 2] : null;
      },
      popPrevious: () => {
        const s = stackRef.current;
        if (s.length < 2) return null;
        s.pop();
        return s[s.length - 1] ?? null;
      },
      getStack: () => [...stackRef.current],
    }),
    [],
  );

  return (
    <NavigationHistoryContext.Provider value={api}>{children}</NavigationHistoryContext.Provider>
  );
};

export const useNavigationHistory = (): NavHistoryAPI => {
  const ctx = useContext(NavigationHistoryContext);
  return ctx ?? NOOP_API;
};
