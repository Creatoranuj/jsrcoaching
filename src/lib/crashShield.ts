// Crash Shield — prevents WebView freeze / unresponsive UI from killing the app.
//
// Three layers of protection:
//   1. Heartbeat watchdog — if the main thread is blocked > 10s, reload.
//   2. Global unhandled-rejection trap — prevents the WebView context from
//      being torn down by Android when too many uncaught errors accumulate.
//   3. Visibility-resume guard — when user returns to a backgrounded app
//      whose JS context was killed, force a fresh reload instead of showing
//      a frozen/blank screen.
//
// Reload throttling uses sessionStorage so we NEVER enter an infinite reload
// loop — at most 1 auto-reload per 60s session window.

import { redactUrl, addBreadcrumb } from "./sentry";
import { safeGet, safeSet, safeSessionGet, safeSessionSet } from "./storage";

const RELOAD_KEY = "nb_crash_reload_at";
const RELOAD_COOLDOWN_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 2_000;
const HEARTBEAT_FREEZE_THRESHOLD_MS = 10_000;
const MEMORY_CHECK_INTERVAL_MS = 15_000;
const MEMORY_WARN_BYTES = 400 * 1024 * 1024; // 400 MB — Android WebView OOM zone
const HEAP_RATIO_DANGER = 0.8; // 80% of THIS device's heap limit
const LONG_TASK_MS = 400; // main-thread block worth a breadcrumb

// Cooldown lives in BOTH sessionStorage (fast, per-tab) AND localStorage
// (survives WebView process death after OOM). Android frequently kills the
// WebView on low-memory, which wipes sessionStorage — without the localStorage
// mirror, the "1 reload per 60s" guard resets exactly when the crash loop is
// most likely, letting the app enter a boot-crash-reload cycle.
function readReloadAt(): number {
  const a = Number(safeSessionGet(RELOAD_KEY) || "0");
  const b = Number(safeGet(RELOAD_KEY) || "0");
  return Math.max(a, b);
}

function canReload(): boolean {
  return Date.now() - readReloadAt() > RELOAD_COOLDOWN_MS;
}

function safeReload(reason: string) {
  if (!canReload()) {
    console.warn("[crashShield] reload suppressed (cooldown):", reason);
    // Audit fix: reset rejectionCount so a single fresh rejection after
    // the cooldown branch doesn't immediately re-trigger the (suppressed)
    // reload path on every event, spamming the log.
    rejectionCount = 0;
    rejectionWindowStart = Date.now();
    return;
  }
  const now = Date.now();
  safeSessionSet(RELOAD_KEY, String(now));
  safeSet(RELOAD_KEY, String(now));
  // Leave a Sentry breadcrumb BEFORE reload so the last-known state survives
  // the WebView tear-down. Prior state: reload happened silently, losing the
  // most diagnostic breadcrumb of the entire session.
  // [auto-fixed 2026-07-06] Enrich payload with route + memMB so the freeze
  // breadcrumb groups cleanly in Sentry instead of collapsing to a raw string.
  const route = typeof window !== "undefined" ? window.location.pathname : "unknown";
  const memMB = (() => {
    try {
      const perf = (typeof performance !== "undefined" ? (performance as unknown as { memory?: { usedJSHeapSize?: number } }) : null);
      const bytes = perf?.memory?.usedJSHeapSize;
      return typeof bytes === "number" ? Math.round(bytes / 1024 / 1024) : null;
    } catch { return null; }
  })();
  try { addBreadcrumb("crash-shield", `auto-reload: ${reason}`, { reason, route, memMB }); } catch { /* noop */ }
  console.warn("[crashShield] auto-reloading:", reason, { route, memMB });
  try {
    window.location.reload();
  } catch { /* noop */ }
}

/** Heartbeat — a worker-like setTimeout chain. If the gap between ticks
 *  exceeds the freeze threshold, the main thread was blocked → reload.
 *
 *  IMPORTANT: setTimeout is heavily throttled when the tab/WebView is
 *  hidden (Android backgrounding, browser tab switch, OS doze). A long
 *  gap there is NOT a freeze — it's just throttling. We must:
 *   1. Skip detection while document.hidden was true at any point in the gap.
 *   2. Reset lastTick whenever visibility returns, so the first post-resume
 *      tick doesn't see a stale baseline.
 */
let heartbeatLastTick = Date.now();
let heartbeatSuppressUntil = 0;

function startHeartbeat() {
  heartbeatLastTick = Date.now();
  const tick = () => {
    const now = Date.now();
    const gap = now - heartbeatLastTick;
    heartbeatLastTick = now;
    const hidden = typeof document !== "undefined" && document.hidden;
    if (hidden || now < heartbeatSuppressUntil) {
      setTimeout(tick, HEARTBEAT_INTERVAL_MS);
      return;
    }
    if (gap > HEARTBEAT_FREEZE_THRESHOLD_MS) {
      safeReload(`main-thread frozen ${gap}ms`);
      return;
    }
    setTimeout(tick, HEARTBEAT_INTERVAL_MS);
  };
  setTimeout(tick, HEARTBEAT_INTERVAL_MS);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        // Throw away the throttled gap and give the page a grace period
        // before the watchdog is allowed to fire again.
        heartbeatLastTick = Date.now();
        heartbeatSuppressUntil = Date.now() + 5_000;
      }
    });
  }
}

let rejectionCount = 0;
// Raised from 8 → 15 and window narrowed 15s → 10s. On offline cold start
// React Query + Supabase realtime can legitimately fire 8+ rejections within
// 15s, which used to trigger an emergency reload loop with no actual crash.
const REJECTION_THRESHOLD = 15;
const REJECTION_WINDOW_MS = 10_000;
let rejectionWindowStart = Date.now();

// Patterns we treat as "expected" — they should NOT count toward the
// emergency-reload threshold. Network / auth / abort errors are routine on
// flaky mobile data; only genuinely unexpected rejections indicate a crash.
// C2: websocket pattern narrowed — broad /websocket/i was masking Realtime
// logic errors. We only silence true connection-layer noise (HMR + Realtime
// reconnects), not application-level WebSocket exceptions.
// Audit fix: added `UNIMPLEMENTED|not implemented` — Capacitor plugin proxies
// reject with this code on platforms that don't implement a method (e.g. web,
// or Android pre-plugin-install). These are routine and already handled by the
// caller; they should NOT count toward the emergency-reload threshold.
const EXPECTED_REJECTION_RE =
  /network|fetch|offline|failed to fetch|aborted|abort|timeout|timed out|401|403|cancell?ed|websocket (connection failed|closed without opened|is closed|disconnect)|HMR|UNIMPLEMENTED|not implemented/i;

function installGlobalTraps() {
  window.addEventListener("unhandledrejection", (e) => {
    let msg = "";
    try {
      msg = String(
        (e.reason as { message?: string } | null)?.message ?? e.reason ?? ""
      );
    } catch { msg = ""; }
    // Silence expected rejections so they don't count toward the threshold,
    // but still preventDefault so the WebView doesn't log them as fatal.
    if (EXPECTED_REJECTION_RE.test(msg)) {
      try { e.preventDefault(); } catch { /* noop */ }
      return;
    }
    const now = Date.now();
    if (now - rejectionWindowStart > REJECTION_WINDOW_MS) {
      rejectionWindowStart = now;
      rejectionCount = 0;
    }
    rejectionCount += 1;
    console.error("[crashShield] unhandledrejection", e.reason);
    try { e.preventDefault(); } catch { /* noop */ }
    if (rejectionCount >= REJECTION_THRESHOLD) {
      safeReload(`${rejectionCount} unhandled rejections in ${REJECTION_WINDOW_MS / 1000}s`);
    }
  });

  window.addEventListener("error", (e) => {
    // Chunk-load errors — most often after a deploy. Force reload to grab
    // the new index.html (only once per cooldown window). Reason string
    // is redacted before it lands in Sentry (extends F2.3).
    const msg = String(e.message || "");
    if (/Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError/i.test(msg)) {
      safeReload(`chunk load failed: ${redactUrl(msg, 80)}`);
    }
  });
}

/** Emit a Sentry breadcrumb when JS heap crosses the WebView OOM zone.
 *  Chrome-only API — no-op on iOS WKWebView (Safari does not expose
 *  `performance.memory`). Ties into the app-crash-shield skill's OOM
 *  diagnosis workflow. */
function installMemoryMonitor() {
  const perf = performance as unknown as {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  };
  if (!perf.memory) return;
  let lastWarnedAt = 0;
  setInterval(() => {
    try {
      const used = perf.memory!.usedJSHeapSize;
      // Device-relative pressure: a 400MB absolute threshold never fires on
      // a budget phone whose whole heap limit is ~256MB — it OOMs first. Warn
      // when we cross 80% of THIS device's limit, whichever comes first.
      const limit = perf.memory!.jsHeapSizeLimit || 0;
      if (limit > 0 && used / limit > HEAP_RATIO_DANGER && Date.now() - lastWarnedAt > 60_000) {
        lastWarnedAt = Date.now();
        const pct = Math.round((used / limit) * 100);
        addBreadcrumb("memory", `heap ${pct}% of device limit`, {
          usedMB: Math.round(used / (1024 * 1024)),
          limitMB: Math.round(limit / (1024 * 1024)),
        });
        console.warn(`[crashShield] heap at ${pct}% of device limit — trimming`);
        try { window.dispatchEvent(new Event("memorywarning")); } catch { /* noop */ }
        return;
      }
      if (used > MEMORY_WARN_BYTES && Date.now() - lastWarnedAt > 60_000) {
        lastWarnedAt = Date.now();
        const mb = Math.round(used / (1024 * 1024));
        addBreadcrumb("memory", `heap ${mb}MB (>400MB WebView danger zone)`, { usedMB: mb });
        console.warn(`[crashShield] heap ${mb}MB — approaching OOM`);
      }
    } catch { /* noop */ }
  }, MEMORY_CHECK_INTERVAL_MS);
}

/** Listen for Android lowMemory + memorywarning, dump caches BEFORE the
 *  OS kills the WebView. This is the last line of defence against OOM. */
function installMemoryPressureHandler() {
  const trim = () => {
    console.warn("[crashShield] memory pressure → trimming caches");
    try { addBreadcrumb("memory", "cache trimmed (memory pressure)"); } catch { /* noop */ }
    try { sessionStorage.removeItem("nb_query_cache_v1"); } catch { /* noop */ }
    try { localStorage.removeItem("nb_query_cache_v1"); } catch { /* noop */ }
    try { sweepLocalStorage(); } catch { /* noop */ }
    // Best-effort: revoke any tracked blob URLs.
    try {
      const tracked = (window as unknown as { __nb_blob_urls?: Set<string> }).__nb_blob_urls;
      tracked?.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
      tracked?.clear();
    } catch { /* noop */ }
  };
  // Capacitor App plugin emits `appStateChange` but not lowMemory directly;
  // on Android we hook the global `memorywarning` event our native shim
  // dispatches, and on iOS WKWebView dispatches `memorywarning` natively.
  // Guarded to native only — browsers never fire this event and the extra
  // visibilitychange handler here duplicated the heartbeat's own listener.
  let isNative = false;
  try {
    // Cheap sync check — Capacitor sets this global at bootstrap.
    isNative = Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.());
  } catch { /* noop */ }
  if (!isNative) return;
  window.addEventListener("memorywarning", trim);
  // Light hidden-time blob sweep. Piggy-backs on the heartbeat's own
  // visibilitychange listener conceptually but is scoped to blob revocation,
  // not heartbeat reset — keeping it separate is intentional.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    try {
      const tracked = (window as unknown as { __nb_blob_urls?: Set<string> }).__nb_blob_urls;
      tracked?.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
      tracked?.clear();
    } catch { /* noop */ }
  });
}

/**
 * localStorage bloat is a top freeze cause on Android WebView: once the
 * per-origin quota (~5–10 MB) is near full, every setItem call becomes
 * synchronous-slow and can throw QuotaExceededError. React Query persisters
 * and our lesson/prefs caches keep writing → main thread stalls → user sees
 * "only the back button works".
 *
 * Sweep heuristic: if total localStorage payload is over LS_SOFT_LIMIT,
 * drop the heaviest known-disposable buckets (lesson bundles, query cache,
 * old reader-mode prefs). Runs once at boot and again on memory pressure.
 */
const LS_SOFT_LIMIT = 3_500_000; // ~3.5 MB — well under Android's 5 MB cliff
const LS_DISPOSABLE_PREFIXES = [
  "nb_query_cache_v1",
  "nb:lesson-bundle:",
  "nb:reader-mode:",
  "nb_pdf_progress_",
];

function sweepLocalStorage() {
  if (typeof localStorage === "undefined") return;
  let total = 0;
  const sizes: Array<{ key: string; size: number }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const v = localStorage.getItem(k) || "";
    const size = k.length + v.length;
    total += size;
    sizes.push({ key: k, size });
  }
  if (total < LS_SOFT_LIMIT) return;
  console.warn(`[crashShield] localStorage ${(total / 1024 / 1024).toFixed(2)}MB → sweeping disposables`);
  // Drop disposable buckets, largest first, until we're under the limit.
  const disposable = sizes
    .filter((s) => LS_DISPOSABLE_PREFIXES.some((p) => s.key.startsWith(p)))
    .sort((a, b) => b.size - a.size);
  for (const item of disposable) {
    if (total < LS_SOFT_LIMIT * 0.7) break;
    try { localStorage.removeItem(item.key); total -= item.size; } catch { /* noop */ }
  }
}

// NOTE: installResumeGuard() was REMOVED. It duplicated stale-background
// detection that useResumeRecovery already performs with a shorter, more
// aggressive 10-min threshold. Running BOTH caused the two systems to consume
// their independent one-shot reload guards simultaneously on long backgrounds,
// permanently disabling auto-recovery. useResumeRecovery is now the single
// source of truth for stale-bg reloads.

/** Long-task breadcrumbs.
 *  A freeze is almost always preceded by a run of 400ms+ main-thread tasks.
 *  Without this, Sentry only shows the reload and never what caused it, which
 *  is exactly the gap that made freeze reports un-actionable without adb.
 *  PerformanceObserver("longtask") is Chromium-only — no-op elsewhere. */
function installLongTaskObserver() {
  const PO = (window as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
  if (!PO) return;
  let last = 0;
  try {
    const obs = new PO((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < LONG_TASK_MS) continue;
        // Throttle: a janky scroll can emit dozens per second and would blow
        // the Sentry breadcrumb ring, hiding the useful history.
        if (Date.now() - last < 5_000) continue;
        last = Date.now();
        addBreadcrumb("perf", `long task ${Math.round(entry.duration)}ms`, {
          route: window.location.pathname,
          durationMs: Math.round(entry.duration),
        });
      }
    });
    obs.observe({ entryTypes: ["longtask"] });
  } catch { /* longtask unsupported */ }
}

/** Register a blob URL so memory-pressure cleanup can revoke it.
 *  PDF/video readers create large blob URLs; unrevoked ones are a top OOM
 *  cause on Android because the bytes stay alive until the document dies. */
export function trackBlobUrl(url: string): string {
  try {
    const w = window as unknown as { __nb_blob_urls?: Set<string> };
    (w.__nb_blob_urls ||= new Set()).add(url);
  } catch { /* noop */ }
  return url;
}

/** Revoke + forget a tracked blob URL (call when a reader unmounts). */
export function releaseBlobUrl(url: string): void {
  try { URL.revokeObjectURL(url); } catch { /* noop */ }
  try {
    (window as unknown as { __nb_blob_urls?: Set<string> }).__nb_blob_urls?.delete(url);
  } catch { /* noop */ }
}

// Idempotency guard on `window` (not module-local) so duplicate module
// evaluations across chunks / Vite HMR / StrictMode double-invocation don't
// re-run init and produce the "two [crashShield] installed" lines seen in
// admin Eruda logs (audit LOW).
declare global {
  interface Window { __nb_crashShieldInstalled?: boolean }
}

export function initCrashShield(): void {
  if (typeof window === "undefined") return;
  if (window.__nb_crashShieldInstalled) return;
  window.__nb_crashShieldInstalled = true;
  try {
    installGlobalTraps();
    installMemoryPressureHandler();
    installMemoryMonitor();
    installLongTaskObserver();
    // Why did the process die last time? Android knows; ask it once per boot
    // so native-side kills (OOM/ANR/native crash) reach Sentry without adb.
    void import("./nativeExitInfo")
      .then((m) => m.reportLastNativeExit())
      .catch(() => { /* diagnostics must never break boot */ });
    // Boot-time sweep: if the previous session left localStorage near quota,
    // trim now before any persister tries to write and stalls the main thread.
    try { sweepLocalStorage(); } catch { /* noop */ }
    // C3: Defer heartbeat until after first paint / idle so a slow cold boot
    // (heavy hydration on budget Android) is never misread as a "frozen main
    // thread" and force-reloaded mid-boot. requestIdleCallback falls back to
    // a 2s setTimeout where unsupported (Safari < 16.4).
    const startHB = () => {
      try { startHeartbeat(); } catch { /* noop */ }
    };
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (typeof ric === "function") {
      ric(startHB, { timeout: 5_000 });
    } else {
      setTimeout(startHB, 2_000);
    }
    console.log("[crashShield] installed (heartbeat + traps + memory)");
  } catch (err) {
    console.warn("[crashShield] install failed", err);
  }
}
