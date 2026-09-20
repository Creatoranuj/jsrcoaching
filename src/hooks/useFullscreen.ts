import { useEffect, useId, useRef } from "react";
import {
  enterFullscreen,
  exitFullscreen,
} from "../lib/native/fullscreen";

/**
 * Declarative wrapper around the ref-counted native fullscreen owner set.
 *
 * ```tsx
 * useFullscreen(isImmersive, { deep: true });
 * ```
 *
 * The hook holds a stable owner id for the component instance, so two
 * fullscreen surfaces mounted at once (video inside an immersive reader)
 * cannot restore each other's chrome. Unmount always releases the claim.
 */
export function useFullscreen(active: boolean, opts?: { deep?: boolean; id?: string }) {
  const generated = useId();
  const owner = opts?.id ?? generated;
  const deep = opts?.deep ?? false;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;

  useEffect(() => {
    if (active) enterFullscreen(owner, deep);
    else exitFullscreen(owner);
  }, [active, deep, owner]);

  useEffect(() => () => exitFullscreen(ownerRef.current), []);
}
