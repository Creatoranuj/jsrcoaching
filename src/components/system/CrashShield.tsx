import { Component, type ReactNode, useEffect } from "react";
import { toast } from "sonner";
import { addBreadcrumb, captureException } from "../../lib/sentry";

interface Props {
  source: string;
  children: ReactNode;
  /** Custom fallback renderer. Defaults to a compact card with a Reload button. */
  fallback?: (retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  err?: unknown;
}

/**
 * Long-lived viewer shield.
 * - Catches render/mount errors in heavy surfaces (Lesson, PDF, video).
 * - Emits a low-frequency heartbeat breadcrumb so we can correlate WebView
 *   crashes with the last-active surface in Sentry / logcat.
 * - Recovers via a soft remount (retry) without navigating away.
 *
 * Applies rules from app-crash-shield + senior-architect-audit skills.
 */
export default class CrashShield extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, err };
  }

  componentDidCatch(err: unknown, info: unknown) {
    try {
      captureException(err, { source: `crash-shield:${this.props.source}`, info: String(info) });
      addBreadcrumb("crash-shield", "caught", { source: this.props.source });
    } catch { /* swallow — never let error path re-throw */ }
    try { toast.error("Kuch atak gaya — Reload dabao."); } catch { /* ignore */ }
  }

  retry = () => this.setState({ hasError: false, err: undefined });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback(this.retry);
      return (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-border/50 bg-card p-6 text-center">
          <p className="text-sm font-medium text-foreground">Viewer atak gaya.</p>
          <p className="text-xs text-muted-foreground">
            Ek reload se theek ho jayega. Aapka data safe hai.
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Reload viewer
          </button>
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
