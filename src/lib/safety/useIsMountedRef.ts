import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Ref that flips to `false` on unmount. Guard every setter that runs after
 * an `await` with `if (!mounted.current) return;` to prevent
 * "setState on unmounted component" warnings and stale writes.
 */
export function useIsMountedRef(): MutableRefObject<boolean> {
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);
  return ref;
}
