import { useEffect, useRef, useState } from "react";
import { WifiOff, X } from "lucide-react";

/**
 * Sticky offline indicator. Shows ONCE per offline transition then auto-dismisses
 * after 4s so it doesn't constantly grab attention while the user is reading
 * downloaded PDFs. It re-appears only when the connection drops again after
 * having recovered. The user can also tap × to dismiss immediately.
 */
const OfflineBanner = () => {
  const [offline, setOffline] = useState(false);
  const [visible, setVisible] = useState(false);
  const wasOffline = useRef(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform()) {
          const { Network } = await import("@capacitor/network");
          const status = await Network.getStatus();
          if (!cancelled) setOffline(!status.connected);
          const handle = await Network.addListener("networkStatusChange", (s) => setOffline(!s.connected));
          cleanup = () => handle.remove();
          return;
        }
      } catch {
        // fall through to web fallback
      }
      const update = () => setOffline(!navigator.onLine);
      update();
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      cleanup = () => {
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // Show ONCE on each offline→online transition edge; auto-hide after 4s.
  useEffect(() => {
    if (offline && !wasOffline.current) {
      wasOffline.current = true;
      setVisible(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), 4000);
    } else if (!offline) {
      wasOffline.current = false;
      setVisible(false);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    }
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [offline]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 z-[60] flex animate-in slide-in-from-top-2 items-center justify-center gap-2 bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground shadow-md"
      style={{ top: "max(env(safe-area-inset-top, 0px), var(--nb-status-floor, 0px))" }}
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>You're offline — downloaded content still works.</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss offline notice"
        className="ml-2 rounded-full p-0.5 hover:bg-black/20"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

export default OfflineBanner;