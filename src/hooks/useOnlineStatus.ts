import { useEffect, useState } from "react";
import { getNetworkStatus, onNetworkChange } from "../lib/native/network";

/**
 * Reactive online/offline status. Uses the `src/lib/native/network` bridge
 * so hooks stay free of direct `@capacitor/*` imports (ESLint enforced).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const s = await getNetworkStatus();
      if (!cancelled) setOnline(s.connected);
      const unsub = await onNetworkChange((st) => {
        if (!cancelled) setOnline(st.connected);
      });
      if (cancelled) unsub();
      else cleanup = unsub;
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return online;
}
