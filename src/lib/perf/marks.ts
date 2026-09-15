/**
 * Lightweight performance instrumentation for freeze/latency debugging.
 *
 * Uses the browser's `performance.mark` / `performance.measure` API so
 * Chrome DevTools Performance panel + WebView tracing pick it up natively.
 * Also emits a Sentry breadcrumb + logs slow spans to the console in dev,
 * so we can spot regressions without a full Sentry Performance license.
 *
 * Usage:
 *   import { mark, measure } from "@/lib/perf/marks";
 *   mark("dashboard:mount");
 *   // …work…
 *   measure("dashboard:ready", "dashboard:mount"); // ms since mount
 *
 * Zero-cost on cold path: no listeners, no timers, no allocations when
 * disabled. Safe on native (Capacitor WebView supports the Performance API).
 */
import { addBreadcrumb } from "@/lib/sentry";

// Anything slower than this gets a warn-level breadcrumb + dev console log.
// Tune per surface if needed; 400ms is a good "user notices a hiccup" line.
const SLOW_MS = 400;

/** Emit a performance mark and record a Sentry breadcrumb. */
export function mark(name: string, data?: Record<string, unknown>): void {
  try {
    performance.mark(name);
  } catch {
    /* ignore — Safari can throw on duplicate names */
  }
  addBreadcrumb("perf", `mark:${name}`, data);
}

/**
 * Measure between a start mark and now. Returns duration in ms (or NaN if
 * the start mark is missing). Emits a breadcrumb with the duration and
 * warns in dev when the span exceeds `SLOW_MS`.
 */
export function measure(
  name: string,
  startMark: string,
  data?: Record<string, unknown>,
): number {
  let ms = NaN;
  try {
    const entry = performance.measure(name, startMark);
    ms = entry?.duration ?? NaN;
  } catch {
    return NaN;
  }
  const rounded = Math.round(ms);
  addBreadcrumb("perf", `measure:${name}`, { ms: rounded, ...data });
  if (import.meta.env.DEV && ms > SLOW_MS) {
    try {
      console.warn(`[perf] SLOW ${name}: ${rounded}ms`, data ?? "");
    } catch {
      /* ignore */
    }
  }
  return ms;
}

/** Convenience wrapper: time an async function end-to-end. */
export async function timed<T>(
  name: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const start = `${name}:start`;
  mark(start);
  try {
    return await fn();
  } finally {
    measure(name, start);
  }
}

// ---- Reader event ring buffer -------------------------------------------
// Small, allocation-light trace of reader behaviour (autoscroll tick drift,
// frame lag, page-render duration, Shuffle state transitions). Everything is
// behind `readerTraceEnabled()`, so it costs one boolean read when off.

export type ReaderEventKind = "tick" | "frame" | "render" | "shuffle" | "host";

export interface ReaderEvent {
  t: number;
  kind: ReaderEventKind;
  /** Milliseconds of drift / lag / duration, when meaningful. */
  ms?: number;
  /** Free-form detail (shuffle transition label, scroll-host tag). */
  detail?: string;
}

const RING_SIZE = 120;
const ring: ReaderEvent[] = [];
let traceOn = false;
const listeners = new Set<() => void>();

export function setReaderTraceEnabled(on: boolean): void {
  traceOn = on;
  if (!on) ring.length = 0;
  listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function readerTraceEnabled(): boolean {
  return traceOn;
}

export function recordReaderEvent(
  kind: ReaderEventKind,
  data: { ms?: number; host?: string; detail?: string } = {},
): void {
  if (!traceOn) return;
  ring.push({
    t: Date.now(),
    kind,
    ms: data.ms,
    detail: data.detail ?? data.host,
  });
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
  listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function getReaderEvents(): ReaderEvent[] {
  return ring.slice();
}

/** Subscribe to ring-buffer changes (used by the dev debug panel). */
export function subscribeReaderEvents(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Aggregate view for the debug panel. */
export function readerTraceSummary() {
  const ticks = ring.filter((e) => e.kind === "tick" && typeof e.ms === "number");
  const frames = ring.filter((e) => e.kind === "frame" && typeof e.ms === "number");
  const renders = ring.filter((e) => e.kind === "render" && typeof e.ms === "number");
  const avg = (xs: ReaderEvent[]) =>
    xs.length ? xs.reduce((a, b) => a + (b.ms ?? 0), 0) / xs.length : 0;
  return {
    tickDriftMs: avg(ticks),
    droppedFrames: frames.filter((f) => (f.ms ?? 0) > 32).length,
    avgRenderMs: avg(renders),
    host: [...ring].reverse().find((e) => e.kind === "host")?.detail ?? "unknown",
    shuffle: ring.filter((e) => e.kind === "shuffle").slice(-10),
  };
}
