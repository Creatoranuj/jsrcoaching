import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Called when user taps "Try again". Use to reset upstream player state. */
  onRetry?: () => void;
  /** Optional label for telemetry breadcrumbs. */
  context?: string;
}

interface State {
  hasError: boolean;
  message?: string;
  attempt: number;
}

/**
 * Safety net around video player surfaces. Without this, a runtime error
 * inside MahimaGhostPlayer / BunnyStreamPlayer / DriveEmbedViewer would
 * unmount the entire route → white screen on Android WebView.
 *
 * Single-purpose, presentational. Does NOT swallow errors silently:
 *  - logs to console (captured by Eruda / logcat in dev/native builds)
 *  - emits a `window.dispatchEvent("player-error", …)` so a Sentry
 *    listener (if mounted) can record a breadcrumb without coupling here.
 */
export class PlayerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, attempt: 0 };

  static getDerivedStateFromError(err: Error): Partial<State> {
    return { hasError: true, message: err?.message ?? "Unknown player error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
     
    console.error("[PlayerErrorBoundary]", this.props.context ?? "", error, info.componentStack);
    try {
      window.dispatchEvent(
        new CustomEvent("player-error", {
          detail: {
            context: this.props.context,
            message: error?.message,
            stack: error?.stack,
            componentStack: info.componentStack,
          },
        }),
      );
    } catch {
      /* no-op — CustomEvent unsupported (extremely old WebView) */
    }
  }

  handleRetry = () => {
    this.setState((s) => ({ hasError: false, message: undefined, attempt: s.attempt + 1 }));
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.hasError) {
      // `key` forces a clean remount of children on retry — avoids
      // re-entering the same crash with stale internal state.
      return <div key={this.state.attempt}>{this.props.children}</div>;
    }

    return (
      <div
        role="alert"
        className="relative aspect-video w-full bg-black rounded-xl overflow-hidden flex flex-col items-center justify-center gap-3 p-4 text-center"
      >
        <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden />
        <div className="text-white/90 text-sm font-medium">
          Player couldn't load this video
        </div>
        {this.state.message ? (
          <div className="text-white/50 text-xs max-w-[80%] line-clamp-2">
            {this.state.message}
          </div>
        ) : null}
        <button
          type="button"
          onClick={this.handleRetry}
          className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-sm transition-colors"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Try again
        </button>
      </div>
    );
  }
}

export default PlayerErrorBoundary;
