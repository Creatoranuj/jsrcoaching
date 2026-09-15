import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";
import { safeGet, safeSet, safeRemove } from "../lib/storage";
import { logger } from "../lib/logger";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// v2 – force Vite re-resolve
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("[ErrorBoundary] Caught", error, { componentStack: errorInfo.componentStack });
    // Auto-recovery: one silent reload per 60s window if the crash looks
    // transient. Cooldown mirrored to BOTH sessionStorage (fast) and
    // localStorage (survives Android WebView process death post-OOM) so we
    // NEVER enter an infinite boot-crash-reload loop even after the process
    // is respawned.
    try {
      const KEY = "nb_eb_auto_reload_at";
      let last = 0;
      try { last = Math.max(last, Number(sessionStorage.getItem(KEY) || "0")); } catch { /* noop */ }
      last = Math.max(last, Number(safeGet(KEY) || "0"));
      const msg = String(error?.message || "");
      // Includes classic post-suspend WebView re-mount errors on Android.
      const transient = /Loading chunk|dynamically imported module|ChunkLoadError|NetworkError|Failed to fetch|removeChild|is not a function|Cannot read propert(y|ies) of (null|undefined)/i.test(msg);
      if (transient && Date.now() - last > 60_000) {
        const now = String(Date.now());
        try { sessionStorage.setItem(KEY, now); } catch { /* noop */ }
        safeSet(KEY, now);
        setTimeout(() => window.location.reload(), 400);
      }
    } catch { /* noop */ }
  }


  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                {this.props.fallbackTitle || "Something went wrong"}
              </h2>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Please try refreshing the page.
              </p>
              {this.state.error && import.meta.env.DEV && (
                <p className="text-xs text-muted-foreground/70 bg-muted p-2 rounded-lg mt-2 font-mono break-all">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  // Audit fix: history.back() on a cold deep-link (length=1)
                  // navigates the WebView to about:blank → white screen on
                  // Android. Fall back to home when there's no real history.
                  if (window.history.length > 1) window.history.back();
                  else window.location.href = "/";
                }}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
              <Button
                onClick={() => {
                  // Clear ALL reload-cooldown guards so the user is never
                  // permanently locked out of recovery when they manually
                  // tap Refresh after a crash.
                  try {
                    const keys = ["nb_crash_reload_at", "nb_eb_auto_reload_at", "lovable:resume-reload"];
                    for (const k of keys) {
                      try { sessionStorage.removeItem(k); } catch { /* noop */ }
                      safeRemove(k);
                    }
                  } catch { /* noop */ }
                  window.location.reload();
                }}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
