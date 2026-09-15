import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { AppPlugin } from "@/lib/native/app";
import { useAuth } from "../contexts/AuthContext";
import { useNavigationHistory } from "../contexts/NavigationHistoryContext";
import { logger } from "../lib/logger";
import { isAndroid } from "../lib/platform";
import { EXIT_ROUTES, AUTH_ROUTES, resolveBackTarget, resolveRestoreTarget } from "../config/backNavigation";
import { loadCapacitorApp as loadAppPlugin } from "@/lib/native/app";
import { hideKeyboard } from "@/lib/native/keyboard";
import { mark } from "@/lib/perf/marks";
export type { AppPlugin };

// Module-level singleton: prevents StrictMode/HMR async races from registering
// a second backButton listener. The listener reads `latest` instead of closing
// over one hook instance that may have unmounted during StrictMode.
let activeHookCount = 0;
let setupPromise: Promise<void> | null = null;
let removeBackButtonListener: (() => void) | null = null;
let removeAppStateListener: (() => void) | null = null;
let lastBackAt = 0;
let lastExitAttemptAt = 0;
let lastExitOutcome: string = "none";
// Debounce window after ANY history-sentinel pop (playerFullscreen /
// rotationGuard / dialog / sheet). Android WebView emits a synthetic second
// backButton event during a config-change (rotation), which used to consume
// an invisible history entry and make the NEXT real press feel like it
// "exited the screen twice". See audit HIGH: landscape back double-press.
let lastOverlayPopAt = 0;
const OVERLAY_POP_DEBOUNCE_MS = 350;
const latest = {
  path: "/",
  isAuthenticated: false,
  isAdmin: false,
  navigate: null as ReturnType<typeof useNavigate> | null,
  history: null as ReturnType<typeof useNavigationHistory> | null,
};


// Ring-buffer of recent back-button decisions for field diagnostics.
// Visible on /back-button-debug, also mirrored to localStorage so the log
// survives app kill (≤4 KB cap). `dtMs` is the gap from the previous entry,
// making press→minimize latency visible at a glance.
export interface BackDecisionEntry {
  at: number;
  path: string;
  step: string;
  detail?: string;
  dtMs: number | null;
}
const RING_MAX = 50;
const LS_KEY = "nb:back-decisions";
const LS_MAX_BYTES = 4096;
let persistScheduled = false;

// Hydrate from localStorage on module load so the debug page shows the
// previous session's tail after a crash/reload.
const decisionRing: BackDecisionEntry[] = (() => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-RING_MAX) : [];
  } catch {
    return [];
  }
})();

const persistRing = () => {
  if (typeof window === "undefined") return;
  try {
    // Trim from the head until the serialized payload fits the 4 KB budget.
    let slice = decisionRing.slice(-RING_MAX);
    let payload = JSON.stringify(slice);
    while (payload.length > LS_MAX_BYTES && slice.length > 1) {
      slice = slice.slice(1);
      payload = JSON.stringify(slice);
    }
    window.localStorage.setItem(LS_KEY, payload);
  } catch {
    // Quota / private-mode — silent. In-memory ring is still authoritative.
  }
};

const schedulePersistRing = () => {
  if (typeof window === "undefined" || persistScheduled) return;
  persistScheduled = true;
  const run = () => {
    persistScheduled = false;
    persistRing();
  };
  const ric = (window as typeof window & {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
  }).requestIdleCallback;
  if (ric) ric(run, { timeout: 1200 });
  else window.setTimeout(run, 250);
};

const recordDecision = (step: string, detail?: string) => {
  const now = Date.now();
  const prev = decisionRing[decisionRing.length - 1];
  const dtMs = prev ? now - prev.at : null;
  decisionRing.push({ at: now, path: latest.path, step, detail, dtMs });
  if (decisionRing.length > RING_MAX) decisionRing.shift();
  schedulePersistRing();
  if (import.meta.env.DEV) console.warn("[back]", step, detail ?? "", dtMs != null ? `+${dtMs}ms` : "");
};

export const getBackButtonDebug = () => ({
  path: latest.path,
  isAuthenticated: latest.isAuthenticated,
  isAdmin: latest.isAdmin,
  lastBackAt,
  msSinceLastBack: lastBackAt ? Date.now() - lastBackAt : null,
  lastExitAttemptAt,
  lastExitOutcome,
  historyState: typeof window !== "undefined" ? window.history.state : null,
  activeHookCount,
  listenerRegistered: !!removeBackButtonListener,
  decisions: [...decisionRing].reverse(),
});

export const useAndroidBackButton = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin } = useAuth();
  const navHistory = useNavigationHistory();

  latest.path = location.pathname;
  latest.isAuthenticated = isAuthenticated;
  latest.isAdmin = isAdmin;
  latest.navigate = navigate;
  latest.history = navHistory;

  // The `latest` module-level object intentionally avoids the dependency
  // list — we want ONE listener for the app lifetime, not one per render.
   
  useEffect(() => {
    // Android-only guard. `isNative()` was wrong — it returns true on iOS too,
    // which would let `App.exitApp()` fire later in the chain. Apple rejects
    // apps that programmatically terminate. iOS gets no back-button handler
    // (the platform doesn't have a hardware back anyway).
    if (!isAndroid()) return;
    activeHookCount += 1;

    const setup = async () => {
      if (removeBackButtonListener || setupPromise) return setupPromise;
      setupPromise = (async () => {
        try {
          // Bail out early if all hooks unmounted before we got here.
          if (activeHookCount === 0) return;

          const { plugin: App } = await loadAppPlugin();

          // Double-check after the dynamic import await — if the tree
          // unmounted during import, skip listener registration entirely.
          if (activeHookCount === 0) return;

          // Reset the double-tap exit window whenever the activity returns to
          // the foreground. Without this, a user who pressed back once
          // (toast shown) and minimized via Home, then re-opened the app
          // hours later, could trigger an unintended exit on their very next
          // back press because `lastBackAt` was never cleared.
          try {
            const appStateHandle = await App.addListener("appStateChange", ({ isActive }) => {
              if (isActive) lastBackAt = 0;
            });
            removeAppStateListener = () => { void appStateHandle.remove(); };
          } catch (e) {
            console.warn("[useAndroidBackButton] appStateChange listener failed", e);
          }

          const listener = await App.addListener("backButton", ({ canGoBack }) => {
            mark("back:press");


            const path = latest.path;
            const nav = latest.navigate;
            const history = latest.history;
            if (!nav || !history) return;

            // Debounce synthetic double-fires from Android WebView during
            // rotation/config-change. Without this, the second event
            // consumes another history entry (e.g. `rotationGuard` pushed
            // by MahimaGhostPlayer during fullscreen-exit reflow) and the
            // user perceives it as "back twice = leaves the screen".
            const nowTs = Date.now();
            if (nowTs - lastOverlayPopAt < OVERLAY_POP_DEBOUNCE_MS) {
              recordDecision("debounced-overlay-pop", `${nowTs - lastOverlayPopAt}ms`);
              return;
            }

            const scrollTop =
              (typeof document !== "undefined" &&
                (document.scrollingElement?.scrollTop ??
                  document.documentElement.scrollTop)) ||
              0;
            const searchStr = typeof window !== "undefined" ? window.location.search : "";
            recordDecision("press", `canGoBack=${canGoBack} scrollTop=${scrollTop} search=${searchStr}`);

            // 0. Soft-keyboard dismiss. If a text input/textarea/contenteditable
            // is focused, the platform expectation on Android is "back closes
            // the keyboard first, not the screen". We blur + call Keyboard.hide
            // and swallow this press so the user can review before navigating.
            const ae = typeof document !== "undefined" ? document.activeElement as HTMLElement | null : null;
            if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
              recordDecision("step0-keyboard-dismiss", ae.tagName);
              void hideKeyboard();
              try { ae.blur(); } catch { /* noop */ }
              return;
            }


            // 1. Fullscreen overlay (PDF / player / rotation-guard / sheet /
            //    dialog) sentinel. `rotationGuard` (MahimaGhostPlayer) and
            //    `askDoubtSheet` were previously uncovered — pressing back
            //    fell through to navigation/exit instead of closing the
            //    overlay.
            const histState = window.history.state;
            if (
              histState?.pdfFullscreen ||
              histState?.playerFullscreen ||
              histState?.rotationGuard ||
              histState?.askDoubtSheet ||
              histState?.overlay
            ) {
              const wasRotationGuard = !!histState?.rotationGuard;
              recordDecision("step1-overlay-pop", wasRotationGuard ? "rotationGuard" : "overlay");
              lastOverlayPopAt = Date.now();
              window.history.back();
              // Audit H-2: the previous `setTimeout(0)` re-push raced with a
              // fast second back-press on slow devices — `popstate` could
              // fire before the 0ms macrotask, sending step-1 down to step-4
              // and exiting the player route. A one-shot popstate listener
              // atomically re-pushes the sentinel the instant the pop lands.
              if (wasRotationGuard) {
                const onPop = () => {
                  window.removeEventListener("popstate", onPop);
                  try {
                    if (!window.history.state?.playerFullscreen) {
                      window.history.pushState({ playerFullscreen: true }, "");
                    }
                  } catch { /* noop */ }
                };
                window.addEventListener("popstate", onPop, { once: true });
              }
              return;
            }

            // 2. Auth pages while authenticated → role-aware home.
            if (latest.isAuthenticated && (AUTH_ROUTES as readonly string[]).includes(path)) {
              const home = latest.isAdmin ? "/admin" : "/dashboard";
              recordDecision("step2-auth-route", home);
              nav(home, { replace: true });
              return;
            }

            // 3. EXIT ROUTES FIRST — once the user is back on a home anchor
            // (`/dashboard`, `/`, `/index`, `/admin`), the next back MUST
            // trigger the double-tap exit gesture. We intentionally short-
            // circuit BEFORE the trail/parent-map steps so a long browse
            // history can never trap the user on dashboard forever.
            if ((EXIT_ROUTES as readonly string[]).includes(path)) {
              const now = Date.now();
              if (now - lastBackAt < 2000) {
                recordDecision("step3-exit-confirmed", "minimizeApp()");
                lastExitAttemptAt = now;
                lastExitOutcome = "attempting";
                // User intent on double-press = CLOSE the app. `exitApp()` is
                // the canonical Capacitor action per the capacitor-app-exit
                // skill. `minimizeApp()` is kept only as a fallback for the
                // rare OEM where exitApp throws ("not implemented").
                (async () => {
                  const { plugin: AppPlug } = await loadAppPlugin();
                  try {
                    lastBackAt = 0;
                    await AppPlug.exitApp();
                    lastExitOutcome = "exited";
                    if (import.meta.env.DEV) console.warn("[back] exitApp() ok");
                  } catch (e) {
                    lastExitOutcome = "exit-failed:" + String(e);
                    logger.error("[back] exitApp failed, falling back to minimize", e);
                    try {
                      await AppPlug.minimizeApp();
                      lastExitOutcome = "minimized";
                    } catch (e2) {
                      lastExitOutcome = "minimize-failed:" + String(e2);
                      logger.error("[back] minimizeApp also failed", e2);
                    }
                  }
                })();

              } else {
                lastBackAt = now;
                recordDecision("step3-exit-hint", "first press");
                try {
                  window.dispatchEvent(new CustomEvent("nb:back-exit-hint"));
                } catch {}
                try {
                  toast("Press back again to exit", {
                    id: "nb-back-exit-hint",
                    duration: 1800,
                  });
                } catch {}
              }
              return;
            }

            // 3.5 Restore-sensitive routes (my-courses in-page drill-down).
            // A bare history.back() here lands on the PARENT route's root
            // state and loses the user's drill position (subject → chapter →
            // lessons all live in MyCourseDetail's component state, not the
            // URL). Navigate — with `replace` so we don't leave the player
            // entry dangling below — to an explicit restore URL built from
            // the current lesson's own params so the exact lesson list is
            // rebuilt. Runs before the trail so history.back() can't win.
            const restoreTarget = resolveRestoreTarget(
              path,
              new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""),
            );
            if (restoreTarget && restoreTarget !== path) {
              recordDecision("step3.5-restore", restoreTarget);
              nav(restoreTarget, { replace: true });
              return;
            }

            // 4. Real navigation trail — matches platform expectations
            // ("back = undo my last nav"). Falls back to parent map only when
            // the trail is empty (cold launch / deep link).
            const prevInTrail = history.peekPrevious();
            if (prevInTrail) {
              recordDecision("step4-trail-back", prevInTrail);
              window.history.back();
              return;
            }

            // 5. Route-aware parent map fallback for deep-links / cold launch.
            const search = new URLSearchParams(window.location.search);
            const target = resolveBackTarget(path, search);
            // Loop guard — never navigate to the page we're already on.
            // Without this, a missing/duplicate STATIC_PARENT_MAP entry could
            // re-fire the same route on every back press and trap the user.
            if (target && target !== path) {
              recordDecision("step5-parent-map", target);
              nav(target);
              return;
            }

            // 6. Fallback: browser history or dashboard.
            if (canGoBack) {
              recordDecision("step6-history-back");
              window.history.back();
            } else {
              recordDecision("step6-fallback-dashboard");
              nav("/dashboard", { replace: true });
            }
          });

          removeBackButtonListener = () => { void listener.remove(); };

          // If everything unmounted while we were attaching, remove immediately.
          if (activeHookCount === 0) {
            removeBackButtonListener();
            removeBackButtonListener = null;
          }
        } catch (err) {
          // Distinguish "not running on Capacitor" (expected on web) from a
          // real chunk-load / plugin failure that would leave Android with
          // NO back-button handler. Audit MED fix.
          const msg = err instanceof Error ? err.message : String(err);
          const isWebEnv = /Cannot find module|Failed to (?:fetch|resolve) (?:dynamically )?imported module|@capacitor\/app/i.test(msg)
            && typeof (window as unknown as { Capacitor?: unknown }).Capacitor === "undefined";
          if (isWebEnv) {
            // Genuine "running on web, no native bridge" — silent is fine.
          } else {
            // Real failure on a Capacitor device — surface to Sentry + adb.
            logger.error("[useAndroidBackButton] setup failed on native", err);
          }
        } finally {

          // Clear inside the IIFE so concurrent mounts don't see a null
          // promise while registration is still pending.
          setupPromise = null;
        }
      })();
      return setupPromise;
    };

    void setup();
    return () => {
      activeHookCount = Math.max(0, activeHookCount - 1);
      if (activeHookCount !== 0) return;
      const pending = setupPromise ?? Promise.resolve();
      pending.then(() => {
        if (activeHookCount !== 0) return;
        if (removeBackButtonListener) {
          removeBackButtonListener();
          removeBackButtonListener = null;
        }
        if (removeAppStateListener) {
          removeAppStateListener();
          removeAppStateListener = null;
        }
      });

    };
  }, []);

  useEffect(() => {
    if (!(EXIT_ROUTES as readonly string[]).includes(location.pathname)) {
      lastBackAt = 0;
    }
  }, [location.pathname]);
};
