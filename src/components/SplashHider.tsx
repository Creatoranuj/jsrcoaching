import { useEffect, useRef } from "react";

/**
 * Hides the native Capacitor splash screen IMMEDIATELY on first React paint.
 *
 * Does NOT wait for auth/Supabase — the Index/Login pages already render their
 * own loading state for any data-dependent UI. Blocking the splash on a network
 * round-trip was the main cause of the 3-5s white-screen on cold start.
 *
 * Safety timeout (1.5s) guarantees the splash never hangs even if JS crashes
 * before the rAF callback fires.
 */
const SplashHider = () => {
  const hidden = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const hide = () => {
      if (hidden.current) return;
      hidden.current = true;
      // Also kill the inline HTML boot placeholder from index.html.
      try { (window as unknown as { __nbKillBoot?: () => void }).__nbKillBoot?.(); } catch { /* noop */ }
      import("@capacitor/core")
        .then(({ Capacitor }) => {
          if (!Capacitor.isNativePlatform()) return;
          return import("@capacitor/splash-screen").then(({ SplashScreen }) =>
            SplashScreen.hide({ fadeOutDuration: 200 })
          );
        })
        .catch(() => { /* native plugin missing on web — fine */ });
    };

    // Preferred path: wait for fonts to be ready, then double-rAF so the
    // first real frame with the correct typography has committed BEFORE
    // we reveal. Eliminates the "splash → blank → text reflow" sequence.
    const fontsReady: Promise<unknown> =
      (typeof document !== "undefined" && "fonts" in document)
        ? (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready
        : Promise.resolve();

    void fontsReady.finally(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) hide();
        });
      });
    });

    // Hard safety net — splash must never hang past 800ms, even if fonts
    // never resolve (network blip, blocked CDN, etc.). Lowered from 1500ms
    // after user reports of splash logo sticking on cold start.
    const t = setTimeout(hide, 800);

    // Belt-and-braces: kick off the native hide in parallel with the rAF
    // path so the splash starts fading the instant Capacitor is reachable,
    // not after fonts + double-rAF + JS work resolves.
    //
    // Guarded by `hidden.current` so we don't fire SplashScreen.hide() twice
    // on cold start (audit MEDIUM BUG #8) — the rAF path also calls hide(),
    // and double-hide produces a visible flicker + a native plugin warning.
    import("@capacitor/core")
      .then(({ Capacitor }) => {
        if (!Capacitor.isNativePlatform()) return;
        if (hidden.current) return;
        hidden.current = true;
        try { (window as unknown as { __nbKillBoot?: () => void }).__nbKillBoot?.(); } catch { /* noop */ }
        return import("@capacitor/splash-screen").then(({ SplashScreen }) =>
          SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {})
        );
      })
      .catch(() => { /* native plugin missing on web — fine */ });

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return null;
};

export default SplashHider;
