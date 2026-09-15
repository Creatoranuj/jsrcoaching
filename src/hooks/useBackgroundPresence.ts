import { useEffect, useState } from "react";

/**
 * Background-aware presence lifecycle bumper.
 *
 * Long live-class sessions (2h+) that keep a Supabase Realtime presence
 * channel alive across app-backgrounding are a memory + double-subscribe
 * risk: if Android kills the WebView while backgrounded, the resurrected
 * page re-subscribes without the server ever seeing us leave, so presence
 * counters drift and the socket lingers.
 *
 * This hook returns a monotonically-increasing `epoch`. Include it in a
 * presence `useEffect`'s dependency array — the effect will tear down and
 * re-subscribe cleanly when the tab has been hidden past `hiddenGraceMs`
 * and then becomes visible again.
 *
 * Cheap by design: one visibilitychange listener, one timer, no bridge
 * calls, no realtime imports. Safe on web (no Capacitor plugin needed).
 */
export function useBackgroundPresence(hiddenGraceMs = 60_000): number {
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let wasSuspended = false;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (hiddenTimer) clearTimeout(hiddenTimer);
        hiddenTimer = setTimeout(() => {
          wasSuspended = true;
          // Bumping epoch while hidden triggers the consumer's cleanup
          // (removeChannel) — the resubscribe won't fire until we're
          // visible again because the browser throttles hidden effects.
          setEpoch((n) => n + 1);
        }, hiddenGraceMs);
      } else {
        if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null; }
        if (wasSuspended) {
          wasSuspended = false;
          setEpoch((n) => n + 1);
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [hiddenGraceMs]);

  return epoch;
}

export default useBackgroundPresence;