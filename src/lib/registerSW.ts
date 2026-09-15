// JSR COACHING — Service Worker registration with preview/iframe safety guard.
//
// The hand-rolled SW at /public/sw.js implements proper offline-first caching
// (network-first for Supabase + hashed JS/CSS, cache-first for images/fonts,
// network-only for HTML navigations to avoid stale-shell traps).
//
// We MUST NOT register the SW inside the Lovable preview iframe — service
// workers there cause stale-content and navigation-interference issues that
// break the live preview. Production (published .lovable.app, custom domain,
// Vercel deploy, Capacitor native shell) is fine.

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;

  // Always wire the "Update available — tap to reload" prompt, even on paths
  // below that intentionally skip SW registration: a stale lazy chunk after a
  // deploy (vite:preloadError) can strand any web build.
  void import("./appUpdate").then((m) => m.initAppUpdatePrompt()).catch(() => {});

  if (!("serviceWorker" in navigator)) return;

  // Dev guard: only register in production builds.
  if (import.meta.env.DEV) return;

  // Preview/iframe guard.
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const host = window.location.hostname;
  const isLovablePreview =
    host.includes("id-preview--") || host.includes("lovableproject.com");

  // Capacitor native shell guard — DO NOT register SW inside the APK/IPA.
  //
  // In a Capacitor WebView the page is served from https://localhost. Each
  // new APK release ships a fresh dist/ with brand-new hashed JS/CSS
  // filenames. A stale SW from a previous APK install keeps serving the
  // OLD cached index.html that references the OLD hashed chunks — which
  // no longer exist in the new bundle — and the app boots to a blank
  // white screen. Offline support inside the APK is already provided by
  // Capacitor's local asset server; the SW adds zero value here and is
  // actively harmful across releases.
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  const isCapacitorNative =
    !!w.Capacitor?.isNativePlatform?.() ||
    window.location.protocol === "capacitor:" ||
    host === "localhost";

  if (isInIframe || isLovablePreview || isCapacitorNative) {
    // Tear down any stale registration left behind from earlier visits or
    // earlier APK versions so the next cold start loads fresh assets.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister().catch(() => {}));
    }).catch(() => {});
    // Also nuke any cached responses the old SW left behind.
    if ("caches" in window) {
      caches.keys()
        .then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})))
        .catch(() => {});
    }
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        // Don't crash the app — offline support is progressive enhancement.
         
        console.warn("[sw] registration failed:", err);
      });
  });
}
