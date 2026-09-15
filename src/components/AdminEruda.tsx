// Eruda in-app DevTools — auto-loads ONLY for signed-in admin accounts.
// Non-admins (including signed-out users) never download the eruda chunk.
//
// Two-phase boot to give admins a true frog-eye view from t=0:
//   1. On admin detection, persist `nb_admin_eruda=1` in localStorage.
//   2. main.tsx checks that flag BEFORE any other code runs and loads
//      Eruda synchronously — so subsequent reloads capture every log
//      (crashShield init, sentry init, web-vitals, network, etc.).
// First-ever admin session still only captures post-init logs; one reload
// after first detection unlocks the full frog-eye view.
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isExpectedConsoleNoise } from "@/lib/nativeDebug";
import { safeSet, safeRemove } from "@/lib/storage";

declare global {
  interface Window {
    __nb_eruda_loaded?: boolean;
  }
}

const ERUDA_FLAG = "nb_admin_eruda";

export default function AdminEruda() {
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // AUDIT 2026-09-08: never mount the debug console in a production build,
    // even for an admin — its assets were loading on student lesson pages.
    // Dev builds and QA builds with VITE_ENABLE_ERUDA=true keep it.
    const erudaAllowed =
      import.meta.env.DEV === true || import.meta.env.VITE_ENABLE_ERUDA === "true";
    if (!erudaAllowed) {
      safeRemove(ERUDA_FLAG);
      return;
    }

    // If user is no longer admin (signed out / role revoked) clear the flag
    // so non-admins on a shared device don't keep getting Eruda on reload.
    if (!isAdmin) {
      safeRemove(ERUDA_FLAG);
      return;
    }

    // Persist for early-boot load on next reload.
    safeSet(ERUDA_FLAG, "1");

    if (window.__nb_eruda_loaded) return;
    window.__nb_eruda_loaded = true;

    import("eruda")
      .then(({ default: eruda }) => {
        try {
          eruda.init();
          const btn = document.querySelector(".eruda-entry-btn") as HTMLElement | null;
          if (btn) btn.setAttribute("aria-label", "Admin DevTools");
          // Re-apply console.error noise filter ON TOP of Eruda's wrap so
          // routine AbortError / Capacitor UNIMPLEMENTED lines don't spam
          // the admin console. nativeDebug is already in the main bundle
          // (imported by main.tsx), so a static import here avoids the
          // INEFFECTIVE_DYNAMIC_IMPORT warning without adding weight.
          try {
            const filter = isExpectedConsoleNoise;
            const w = window as unknown as { __nb_eruda_filter_installed?: boolean };
            if (filter && !w.__nb_eruda_filter_installed) {
              w.__nb_eruda_filter_installed = true;
              const orig = console.error.bind(console);
              console.error = (...args: unknown[]) => {
                if (filter(args)) return;
                orig(...args);
              };
            }
          } catch { /* noop */ }
           
          console.log("[admin] Eruda DevTools loaded for admin account.");
           
          console.info(
            "[admin] Frog-eye view active. Reload once to capture full boot logs (crashShield/sentry/web-vitals)."
          );
        } catch (e) {
          console.warn("[admin] Eruda init failed", e);
        }
      })
      .catch(() => {
        window.__nb_eruda_loaded = false; // allow retry on next mount
      });
  }, [isAdmin]);

  return null;
}

