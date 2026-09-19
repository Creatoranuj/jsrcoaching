import { Component, type ReactNode, useEffect } from "react";
import { addBreadcrumb, captureException } from "../../lib/sentry";
import { isStaleChunkError, reloadForStaleChunk } from "../../lib/chunkError";

interface Props {
  source: string;
  children: ReactNode;
  /** Custom fallback renderer. Defaults to a compact card with a Reload button. */
  fallback?: (retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  err?: unknown;
  /** Human-readable reason shown on the card + copied by "Details copy". */
  detail?: string;
  /** True while a stale-build hard reload is already on its way. */
  reloading?: boolean;
}

/**
 * Long-lived viewer shield.
 * - Catches render/mount errors in heavy surfaces (Lesson, PDF, video).
 * - Recovers a stale build automatically: when the caught error is a missing
 *   JS chunk (app updated while this screen was open), a soft retry can never
 *   help, so we hard-reload once instead of showing a card that comes back on
 *   every tap.
 * - Otherwise recovers via a soft remount (retry) without navigating away, and
 *   shows the real error text so a failure can be reported instead of guessed.
 */
export default class CrashShield extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, err };
  }

  componentDidCatch(err: unknown, info: unknown) {
    const detail = describeError(err, this.props.source);
    try {
      captureException(err, { source: `crash-shield:${this.props.source}`, info: String(info) });
      addBreadcrumb("crash-shield", "caught", { source: this.props.source });
    } catch { /* swallow — never let error path re-throw */ }

    if (isStaleChunkError(err)) {
      // New build shipped while this screen was open. Remounting re-requests
      // the same 404'd chunk, so only a full reload can fix it.
      const reloading = reloadForStaleChunk();
      this.setState({ detail, reloading });
      return;
    }
    this.setState({ detail });
  }

  retry = () => this.setState({ hasError: false, err: undefined, detail: undefined });

  hardReload = () => {
    try { window.location.reload(); } catch { /* ignore */ }
  };

  copyDetail = () => {
    const text = this.state.detail ?? "";
    try {
      void navigator.clipboard?.writeText(text);
    } catch { /* ignore */ }
  };

  render() {
    if (this.state.hasError) {
      if (this.state.reloading) {
        return (
          <div className="flex min-h-[240px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
            App update mila — reload ho raha hai…
          </div>
        );
      }
      if (this.props.fallback) return this.props.fallback(this.retry);
      return (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-border/50 bg-card p-6 text-center">
          <p className="text-sm font-medium text-foreground">Viewer atak gaya.</p>
          <p className="text-xs text-muted-foreground">
            Ek reload se theek ho jayega. Aapka data safe hai.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.retry}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Reload viewer
            </button>
            <button
              type="button"
              onClick={this.hardReload}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Poora app reload
            </button>
          </div>
          {this.state.detail && (
            <details className="w-full max-w-sm text-left">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Technical details
              </summary>
              <p className="mt-2 break-words rounded-md bg-muted p-2 font-mono text-[11px] text-muted-foreground">
                {this.state.detail}
              </p>
              <button
                type="button"
                onClick={this.copyDetail}
                className="mt-2 rounded-md border border-border px-3 py-1 text-xs"
              >
                Details copy karein
              </button>
            </details>
          )}
        </div>
      );
    }
    return (
      <>
        <Heartbeat source={this.props.source} />
        {this.props.children}
      </>
    );
  }
}

/** No-PII one-liner: where it broke, what broke, when. */
function describeError(err: unknown, source: string): string {
  const name = (err as { name?: string })?.name ?? "Error";
  const message = (err as { message?: string })?.message ?? String(err ?? "unknown");
  return `${source} | ${name}: ${message} | ${new Date().toISOString()}`;
}

function Heartbeat({ source }: { source: string }) {
  useEffect(() => {
    addBreadcrumb("crash-shield", "mount", { source });
    const t = window.setInterval(() => {
      addBreadcrumb("crash-shield", "heartbeat", { source, ts: Date.now() });
    }, 15000);
    return () => {
      window.clearInterval(t);
      addBreadcrumb("crash-shield", "unmount", { source });
    };
  }, [source]);
  return null;
}
