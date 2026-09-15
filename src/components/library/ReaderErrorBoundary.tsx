import { Component, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { logger } from "../../lib/logger";
import { addBreadcrumb, reportError } from "../../lib/sentry";

interface Props {
  children: ReactNode;
  onBack: () => void;
  /** Reset the boundary when this key changes (e.g. new file opened). */
  resetKey?: string | number | null;
  label?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Scoped error boundary for in-app document readers (PDF / MD / images).
 * Prevents a reader crash (pdf.js worker death, OOM, corrupt file, DOM
 * detach after Android WebView trim-memory) from taking down the whole app.
 * The user gets a friendly card and can back out to the folder.
 * Part of the app-crash-shield skill.
 */
export default class ReaderErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "Reader crashed" };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    logger.error("[ReaderErrorBoundary] caught", error, info);
    try {
      addBreadcrumb("reader", "reader-crash", { label: this.props.label ?? "reader" });
      reportError(error, { surface: this.props.label ?? "ReaderErrorBoundary" });
    } catch { /* noop */ }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: "" });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Couldn't open this file</h3>
            <p className="text-xs text-muted-foreground">
              The reader ran out of memory or the file is corrupted. Your file is safe — try again after closing other apps.
            </p>
            {import.meta.env.DEV && (
              <p className="text-[10px] text-muted-foreground/70 bg-muted p-2 rounded mt-2 font-mono break-all">
                {this.state.message}
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={this.props.onBack} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <Button
              size="sm"
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
