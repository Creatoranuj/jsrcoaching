/**
 * Web Vitals + long-task logger — zero-dep.
 *
 * Captures LCP, INP, CLS, and long tasks via `PerformanceObserver`. In dev,
 * logs to the console. In prod, pushes Sentry breadcrumbs (no-op if Sentry
 * is unavailable).
 *
 * Designed to be initialised once from `main.tsx` inside an idle callback so
 * it never delays first paint. ~30 lines of runtime cost.
 */

export type VitalsSnapshot = {
  lcp?: number;
  cls?: number;
  inp?: number;
  longTasks: number; // count of long tasks > 50ms since boot
};

const snapshot: VitalsSnapshot = { longTasks: 0 };
let started = false;

function report(name: string, value: number) {
  const v = Math.round(value * 100) / 100;
  if (import.meta.env.DEV) {
     
    console.log(`%c[perf] ${name}=${v}`, "color:#0ea5e9");
  }
  try {
    const w = window as unknown as {
      Sentry?: { addBreadcrumb?: (b: unknown) => void };
    };
    w.Sentry?.addBreadcrumb?.({
      category: "perf",
      message: `${name}=${v}`,
      level: "info",
    });
  } catch {
    /* noop */
  }
}

function safeObserve(type: string, cb: (entries: PerformanceEntry[]) => void) {
  try {
    const po = new PerformanceObserver((list) => cb(list.getEntries()));
    // `buffered: true` replays any entries that fired before we registered.
    po.observe({ type, buffered: true } as PerformanceObserverInit);
    return po;
  } catch {
    return null;
  }
}

export function initWebVitals() {
  if (started || typeof PerformanceObserver === "undefined") return;
  started = true;

  // LCP — last entry wins
  safeObserve("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1] as PerformanceEntry & {
      renderTime?: number;
      loadTime?: number;
    };
    const v = last.renderTime || last.loadTime || last.startTime;
    snapshot.lcp = v;
    report("LCP", v);
  });

  // CLS — sum non-input-caused shifts
  let cls = 0;
  safeObserve("layout-shift", (entries) => {
    for (const e of entries as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
      if (!e.hadRecentInput) cls += e.value;
    }
    snapshot.cls = cls;
  });

  // INP — track worst event duration
  let worstInp = 0;
  safeObserve("event", (entries) => {
    for (const e of entries as Array<PerformanceEntry & { duration: number; interactionId?: number }>) {
      if (e.interactionId && e.duration > worstInp) {
        worstInp = e.duration;
        snapshot.inp = worstInp;
      }
    }
  });

  // Long tasks
  safeObserve("longtask", (entries) => {
    for (const e of entries) {
      if (e.duration > 50) {
        snapshot.longTasks += 1;
        if (import.meta.env.DEV) {
           
          console.warn(`[perf] long task ${Math.round(e.duration)}ms`);
        }
      }
    }
  });

  // Flush a summary at first idle after load
  const onLoad = () => {
    const flush = () => {
      report("CLS", snapshot.cls ?? 0);
      report("longTasks", snapshot.longTasks);
    };
    const idle = (window as typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
    }).requestIdleCallback;
    if (idle) idle(flush);
    else setTimeout(flush, 2000);
  };
  if (document.readyState === "complete") onLoad();
  else window.addEventListener("load", onLoad, { once: true });
}

export function getVitalsSnapshot(): Readonly<VitalsSnapshot> {
  return snapshot;
}
