// JSR COACHING - Entry Point

// Install this synchronously before Eruda, CrashShield, Sentry, React, or
// pdf.js can load. pdf.js/React-PDF intentionally abort in-flight workers when
// the user closes a PDF or when we switch from streaming → byte fallback; on
// Android WebView/Firefox that lifecycle cancellation surfaces as an
// `unhandledrejection` (`AbortError: The operation was aborted.`). It is not a
// crash and must never reach Eruda/Sentry or trigger reload logic.
const NB_EXPECTED_ABORT_RE = /AbortError|AbortException|aborted a request|operation was aborted|worker was terminated|\baborted\b/i;
try {
  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason as { name?: string; message?: string } | string | null | undefined;
      const name = typeof reason === "object" && reason ? reason.name || "" : "";
      const message = typeof reason === "object" && reason ? reason.message || "" : String(reason || "");
      if (NB_EXPECTED_ABORT_RE.test(`${name} ${message}`)) {
        event.preventDefault();
      }
    },
    { capture: true },
  );
} catch { /* noop */ }

// ── Admin Eruda early-boot + console buffer ────────────────────────
// True frog-eye view: BEFORE any other import emits logs (crashShield,
// sentry, nativeDebug, web-vitals), we (1) buffer every console.* call
// and (2) kick off Eruda's dynamic import. When Eruda's init resolves,
// we re-emit the buffered entries so they appear in the in-app panel.
// Gated on a localStorage flag that AdminEruda.tsx writes after auth
// resolves admin = true. Non-admins never trigger this path.
// AUDIT 2026-09-08: the debug console shipped to production and any student
// could enable it by setting one localStorage key, exposing app internals and
// network traffic. The flag is now only honoured in dev builds or in a QA build
// explicitly built with VITE_ENABLE_ERUDA=true, so the eruda chunk is dropped
// from the production bundle entirely.
const ERUDA_ALLOWED =
  import.meta.env.DEV === true || import.meta.env.VITE_ENABLE_ERUDA === "true";

try {
  if (
    ERUDA_ALLOWED &&
    typeof window !== "undefined" &&
    localStorage.getItem("nb_admin_eruda") === "1"
  ) {
    type LogEntry = { level: "log" | "info" | "warn" | "error" | "debug"; args: unknown[]; t: number };
    const buffer: LogEntry[] = [];
    const MAX_BUFFER = 500;
    const levels: LogEntry["level"][] = ["log", "info", "warn", "error", "debug"];
    const original: Partial<Record<LogEntry["level"], (...a: unknown[]) => void>> = {};
    const consoleMethods: Record<LogEntry["level"], (...a: unknown[]) => void> = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
    };
    levels.forEach((lvl) => {
      original[lvl] = consoleMethods[lvl];
      console[lvl] = (...args: unknown[]) => {
        if (buffer.length < MAX_BUFFER) buffer.push({ level: lvl, args, t: Date.now() });
        original[lvl]?.(...args);
      };
    });
    (window as unknown as { __nb_eruda_buffer?: LogEntry[] }).__nb_eruda_buffer = buffer;

    import("eruda").then(({ default: eruda }) => {
      try {
        if (!(window as unknown as { __nb_eruda_loaded?: boolean }).__nb_eruda_loaded) {
          eruda.init();
          (window as unknown as { __nb_eruda_loaded?: boolean }).__nb_eruda_loaded = true;
          // Eruda wraps console.error at init and becomes the outermost
          // layer — our nativeDebug filter alone can't stop routine
          // AbortError / Capacitor UNIMPLEMENTED noise from reaching Eruda's
          // panel. Re-wrap once here so the same suppression logic applies
          // to the Eruda console too. Idempotent — module guard prevents
          // double-wrapping on HMR.
          try {
            // Static import below guarantees nativeDebug is already in the
            // main chunk — reuse it directly (avoids Rolldown's "ineffective
            // dynamic import" warning that comes from importing the same
            // module both ways).
             
            const filter = (globalThis as unknown as { __nb_isExpectedConsoleNoise?: (args: unknown[]) => boolean }).__nb_isExpectedConsoleNoise;
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

          // Replay buffered entries so admin sees pre-init boot logs.
          original.log?.(`[admin] Eruda early-boot loaded — replaying ${buffer.length} buffered log(s).`);
          buffer.forEach((e) => {
             
            original[e.level]?.(`[t+${e.t}]`, ...e.args);
          });
        }
      } catch { /* noop */ }
    }).catch(() => { /* noop */ });
  }
} catch { /* noop */ }

// ── Lovable-preview iframe noise suppression ───────────────────────
// The Lovable preview harness posts window messages (e.g. SET_SAFE_AREA)
// that our app doesn't handle, which the harness then logs as
// `console.warn("Unknown message type: <TYPE>")`. Only observed inside
// the Lovable preview iframe — never in prod APK / web build. Mute the
// exact string so Sentry breadcrumb triage stays clean.
// See: mem://index.md — signal-only, do not broaden.
try {
  if (typeof window !== "undefined") {
    const PREVIEW_NOISE_RE = /^Unknown message type:\s*(SET_SAFE_AREA|SET_KEYBOARD|SET_STATUS_BAR)\b/;
    for (const method of ["warn", "log", "info", "error"] as const) {
      const orig = (console[method] as (...a: unknown[]) => void).bind(console);
       
      console[method] = (...args: unknown[]) => {
        try {
          const first = typeof args[0] === "string" ? (args[0] as string) : "";
          if (PREVIEW_NOISE_RE.test(first)) return;
        } catch { /* fall through */ }
        orig(...args);
      };
    }
  }
} catch { /* noop */ }

// NOTE: the admin-Eruda early-boot block above intentionally runs exactly
// once. A duplicate copy used to live here and caused every console.* call
// to be wrapped twice (doubling log volume) plus a second `import("eruda")`
// network request on cold boot. Do not re-add — see plan.md perf pass.





import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// Rebrand fonts — Libre Baskerville (serif) + IBM Plex Sans (body).
import "@fontsource/libre-baskerville/400.css";
import "@fontsource/libre-baskerville/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./index.css";
import { initNativeDebug } from "./lib/nativeDebug";
import { logger } from "@/lib/logger";

// Synchronous: needed before any other code so native console.log works.
initNativeDebug();

// Eruda — legacy QA flag path. Kept for non-admin QA builds that ship
// with VITE_ENABLE_ERUDA=true. Admin-gated path lives in AdminEruda.tsx
// + the early-boot block at the top of this file.
if (ERUDA_ALLOWED && import.meta.env.VITE_ENABLE_ERUDA === "true") {
  import("eruda").then(({ default: eruda }) => {
    try {
      if (!(window as unknown as { __nb_eruda_loaded?: boolean }).__nb_eruda_loaded) {
        eruda.init();
        (window as unknown as { __nb_eruda_loaded?: boolean }).__nb_eruda_loaded = true;
      }
      const btn = document.querySelector(".eruda-entry-btn") as HTMLElement | null;
      if (btn) btn.setAttribute("aria-label", "QA DevTools");
      if (import.meta.env.DEV) {
         
        console.log("[QA] Eruda DevTools loaded — tap the floating button.");
      }
    } catch { /* noop */ }
  }).catch(() => { /* noop */ });
}

// Crash shield — heartbeat watchdog + global rejection trap + resume guard.
// Auto-reloads (cooldown-throttled) when the WebView freezes or its JS
// context is reaped after long backgrounding. Fixes "app stuck, touch not
// working" issue without needing the user to force-close.
import("./lib/crashShield").then((m) => m.initCrashShield()).catch(() => {});

// Boot watchdog — if the root never paints in 12s (white-screen freeze on
// low-RAM Android before React mounts), force a one-shot reload. Guarded
// by sessionStorage so we never enter a loop.
const BOOT_KEY = "nb_boot_watchdog_at";
try {
  const last = Number(sessionStorage.getItem(BOOT_KEY) || "0");
  if (Date.now() - last > 60_000) {
    // RELY fix (LTP3 MED): attach the MutationObserver FIRST, then start the
    // 12s reload timer. Prior order set the timer before the observer, so on
    // mid-tier Android where hydration takes 10-12s the observer could miss
    // the first paint and the watchdog would force-reload a healthy boot.
    let bootTimer: number | undefined;
    const cancel = () => {
      if (bootTimer !== undefined) {
        window.clearTimeout(bootTimer);
        bootTimer = undefined;
      }
      try { sessionStorage.removeItem(BOOT_KEY); } catch { /* noop */ }
    };
    const root = document.getElementById("root");
    const observer = new MutationObserver(() => {
      const r = document.getElementById("root");
      if (r && r.childElementCount > 0) {
        cancel();
        observer.disconnect();
      }
    });
    if (root) observer.observe(root, { childList: true });
    // Also cancel on first animation frame if paint already happened — belt
    // and suspenders for the case where React mounted before this ran.
    requestAnimationFrame(() => {
      const r = document.getElementById("root");
      if (r && r.childElementCount > 0) { cancel(); observer.disconnect(); }
    });
    bootTimer = window.setTimeout(() => {
      const r = document.getElementById("root");
      const painted = !!r && r.childElementCount > 0;
      if (!painted) {
        try { sessionStorage.setItem(BOOT_KEY, String(Date.now())); } catch { /* noop */ }
        try { window.location.reload(); } catch { /* noop */ }
      }
    }, 12_000);
  }
} catch { /* noop */ }


// Render IMMEDIATELY — nothing else blocks the first paint.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Defer ALL non-critical boot work until the browser is idle. This frees the
// main thread for React's first paint, eliminating the cold-start white screen.
type IdleCb = (cb: () => void) => void;
const idle: IdleCb =
  typeof (window as unknown as { requestIdleCallback?: IdleCb }).requestIdleCallback === "function"
    ? (window as unknown as { requestIdleCallback: IdleCb }).requestIdleCallback
    : (cb) => setTimeout(cb, 0);

// (Removed __nb_sentry_listeners_installed — no listeners are registered here
// anymore; nativeDebug owns the single capture-phase source.)



idle(() => {
  // Sentry wrapper + SDK stay fully outside the app shell. The wrapper then
  // dynamically imports @sentry/react only in prod with a DSN.
  //
  // OBS fix (LTP3 HIGH): the previous window.error / unhandledrejection
  // listeners registered here were REDUNDANT. `nativeDebug.initNativeDebug()`
  // already installs capture-phase listeners that filter noise and re-emit
  // real errors through `console.error`, which the Sentry
  // `installConsoleErrorForwarder` (invoked from `initSentry`) forwards to
  // Sentry. Registering them again in the bubble phase caused every real
  // error to be reported to Sentry twice. Removed — single-source pipeline
  // is: window event → nativeDebug (capture) → console.error → Sentry.
  import("./lib/sentry").then((m) => { void m.initSentry(); }).catch(() => {});
  import("./lib/androidImmersive").then((m) => m.installImmersiveAutoToggle()).catch(() => {});
  // Capgo OTA updater removed — paid SaaS not used. Updates ship via Play Store APK.
  import("./lib/registerSW").then((m) => m.registerServiceWorker()).catch(() => {});
  import("./lib/native/security").then((m) => m.checkDeviceIntegrity()).catch(() => {});
  // Web Vitals + long-task logger (skill #6 — perf observability).
  import("./lib/perf/webVitals").then((m) => m.initWebVitals()).catch(() => {});
  // Ask the OS to mark our storage as persistent so downloaded PDFs aren't
  // silently evicted under memory pressure. Risk accepted by product owner —
  // manual cleanup UI lives in StorageManagerSheet.
  import("./lib/persistentStorage").then((m) => void m.requestPersistentStorage()).catch(() => {});
  // NOTE: keyboard inset tracker (--nb-keyboard-h) is initialised inside
  // initNativeChrome() in App.tsx — do NOT register it again here or
  // listeners fire twice on every keyboard event.
  // Screen protection baseline: force FLAG_SECURE OFF at boot so students
  // can screenshot everywhere EXCEPT LessonView (the only opt-in surface).
  // Without this, any residual native flag from a warm start would trap
  // students on Profile/Courses/Books/Downloads. Admin bypass is unchanged.
  import("./hooks/useScreenProtection").then((m) => m.bootstrapScreenProtection()).catch(() => {});
});

