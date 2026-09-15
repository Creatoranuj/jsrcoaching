import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadCapacitorApp } from "@/lib/native/app";
import { loadCore } from "@/lib/native/core";
import { toInternalPath } from "@/config/deepLinks";

/**
 * Wires Capacitor App URL events to React Router. Capacitor plugins are
 * dynamically imported so the web bundle never ships them.
 */
export const useDeepLinks = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { Capacitor } = await loadCore();
        if (!Capacitor.isNativePlatform()) return;
        const { plugin: App } = await loadCapacitorApp();
        if (disposed) return;

        App.getLaunchUrl()
          .then((res: { url?: string } | null) => {
            if (!res?.url) return;
            const path = toInternalPath(res.url, { dev: import.meta.env.DEV });
            if (path) navigate(path, { replace: true });
          })
          .catch(() => {});

        const handle = App.addListener("appUrlOpen", (event: { url: string }) => {
          const path = toInternalPath(event.url, { dev: import.meta.env.DEV });
          if (path) navigate(path);
        });

        cleanup = () => {
          Promise.resolve(handle).then((h: { remove: () => void }) => h.remove()).catch(() => {});
        };
      } catch {
        // Not running on Capacitor / plugin not available
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [navigate]);
};