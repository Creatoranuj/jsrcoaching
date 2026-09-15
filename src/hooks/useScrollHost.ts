import { useCallback, useEffect, useRef, useState } from "react";
import {
  isScrollable,
  resolveScrollHost,
  type ResolveOptions,
} from "@/lib/reader/scrollHost";

interface Options extends ResolveOptions {
  /** Poll interval (ms) as a safety net for late-mounting PDF containers. */
  recheckMs?: number;
}

/**
 * Resolves the element that actually scrolls and keeps it fresh across
 * resize, orientation change, and DOM growth (ResizeObserver). Returns a
 * stable ref plus a `scrollable` flag callers use to hide dead controls.
 */
export function useScrollHost(options: Options = {}) {
  const { preferred, requireScrollable, recheckMs = 1500 } = options;
  const hostRef = useRef<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [scrollable, setScrollable] = useState(false);

  const resolve = useCallback(() => {
    const next = resolveScrollHost({ preferred, requireScrollable });
    if (next !== hostRef.current) {
      hostRef.current = next;
      setHost(next);
    }
    setScrollable(isScrollable(next) || (!!next && next.scrollHeight > next.clientHeight + 8));
  }, [preferred, requireScrollable]);

  useEffect(() => {
    resolve();
    window.addEventListener("resize", resolve);
    window.addEventListener("orientationchange", resolve);

    // React to document/container growth only — a MutationObserver on body
    // would re-run a layout-forcing read on every class change app-wide.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resolve);
      ro.observe(document.documentElement);
      if (hostRef.current && hostRef.current !== document.documentElement) {
        try { ro.observe(hostRef.current); } catch { /* detached */ }
      }
    }
    const timer = window.setInterval(resolve, recheckMs);
    return () => {
      window.removeEventListener("resize", resolve);
      window.removeEventListener("orientationchange", resolve);
      ro?.disconnect();
      window.clearInterval(timer);
    };
  }, [resolve, recheckMs]);

  return { hostRef, host, scrollable, refresh: resolve };
}

export default useScrollHost;
