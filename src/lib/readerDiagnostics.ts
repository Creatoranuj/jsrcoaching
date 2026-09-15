import { addBreadcrumb } from "./sentry";

export type ReaderRoute = "drive" | "notion" | "pdf" | "docs" | "markdown" | "iframe" | "unknown";

export type ReaderHealthState = "idle" | "loading" | "first-byte" | "ready" | "retrying" | "fallback" | "timeout" | "error" | "unmounted";

export interface ReaderTraceEvent {
  at: string;
  route: ReaderRoute;
  state: ReaderHealthState;
  event: string;
  detail?: Record<string, unknown>;
}

declare global {
  interface Window {
    __NB_READER_TRACE__?: ReaderTraceEvent[];
  }
}

const MAX_TRACE_EVENTS = 80;

const isDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.has("debug") ||
      params.has("readerDebug") ||
      window.localStorage.getItem("nb_pdf_debug") === "1" ||
      window.localStorage.getItem("nb_reader_debug") === "1"
    );
  } catch {
    return false;
  }
};

const safeDetail = (detail?: Record<string, unknown>) => {
  if (!detail) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value === "string") {
      out[key] = value.length > 160 ? `${value.slice(0, 160)}…` : value;
    } else {
      out[key] = value;
    }
  }
  return out;
};

export function traceReader(route: ReaderRoute, state: ReaderHealthState, event: string, detail?: Record<string, unknown>) {
  const entry: ReaderTraceEvent = {
    at: new Date().toISOString(),
    route,
    state,
    event,
    detail: safeDetail(detail),
  };

  try {
    if (typeof window !== "undefined") {
      const trace = window.__NB_READER_TRACE__ ?? [];
      trace.push(entry);
      if (trace.length > MAX_TRACE_EVENTS) trace.splice(0, trace.length - MAX_TRACE_EVENTS);
      window.__NB_READER_TRACE__ = trace;
    }
  } catch {
    /* ignore trace storage failures */
  }

  try {
    addBreadcrumb("reader", event, { route, state, ...entry.detail });
  } catch {
    /* ignore breadcrumb failures */
  }

  if (isDebugEnabled()) {
     
    console.info(`[reader:${route}] ${state} → ${event}`, entry.detail ?? {});
  }

  return entry;
}

export const readerRouteForUrl = (url: string): ReaderRoute => {
  if (/drive\.google\.com/i.test(url)) return "drive";
  if (/docs\.google\.com\/document/i.test(url)) return "docs";
  if (/notion\.(?:so|site|com)/i.test(url)) return "notion";
  if (/\.(md|markdown)(\?|#|$)/i.test(url)) return "markdown";
  if (/pdf|cdn\.jsdelivr\.net|supabase|blob:|file:|capacitor:|ionic:/i.test(url)) return "pdf";
  return "unknown";
};