import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Consumes `nb:push-nav` events dispatched by src/lib/native/push.ts when a
 * user taps a notification. Routes through React Router so the WebView is
 * NOT reloaded (avoids re-boot + state loss).
 */
export const usePushNav = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ path?: string }>).detail;
      const path = detail?.path;
      if (typeof path === "string" && path.startsWith("/")) navigate(path);
    };
    window.addEventListener("nb:push-nav", handler as EventListener);
    return () => window.removeEventListener("nb:push-nav", handler as EventListener);
  }, [navigate]);
};
