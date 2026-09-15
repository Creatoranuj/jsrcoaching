import { useCallback, useEffect, useState } from "react";
import { resolveContentUrl } from "../lib/resolveContentUrl";

export type ResolvedContentStatus = "idle" | "loading" | "ready" | "error";

export interface UseResolvedContentUrlResult {
  url: string | null;
  status: ResolvedContentStatus;
  refetch: () => void;
}

function isContentBucketUrl(url: string): boolean {
  return (
    /^storage:\/\/content\//i.test(url) ||
    /supabase\.co\/storage\/.*\/content\//i.test(url)
  );
}

/**
 * Turns a `content` bucket URL (either legacy `/object/public/content/...`
 * or new `storage://content/...`) into a URL the browser can load.
 * Returns the raw url for external URLs. Exposes status + refetch so callers
 * can render a friendly message on 401/403 and let the user retry.
 *
 * Backwards-compatible: when called and destructured as a string it still
 * behaves like the old string-returning hook via the default export helper
 * `useResolvedContentUrlString` below.
 */
export function useResolvedContentUrl(
  url: string | null | undefined
): UseResolvedContentUrlResult {
  const [resolved, setResolved] = useState<string | null>(url ?? null);
  const [status, setStatus] = useState<ResolvedContentStatus>(url ? "loading" : "idle");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setResolved(null);
      setStatus("idle");
      return;
    }
    if (!isContentBucketUrl(url)) {
      setResolved(url);
      setStatus("ready");
      return;
    }
    setResolved(null);
    setStatus("loading");
    resolveContentUrl(url).then((r) => {
      if (cancelled) return;
      if (r) {
        setResolved(r);
        setStatus("ready");
      } else {
        setResolved(null);
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { url: resolved, status, refetch };
}

/** Legacy string-only shape retained for call sites that only need the URL. */
export function useResolvedContentUrlString(
  url: string | null | undefined
): string | null {
  return useResolvedContentUrl(url).url;
}
