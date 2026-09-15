import { memo, useEffect, useRef, useState } from "react";
import { SpokeSpinner } from "../ui/spoke-spinner";

interface Props {
  /** When false, the overlay unmounts immediately. */
  visible: boolean;
  /** Title shown in the placeholder card. */
  title?: string;
  /**
   * Hint for the simulated curve when we have no real bytes yet.
   * - "pdf"   → canvas FastPdfReader path (real `pdf-progress` events arrive)
   * - "drive" → Google Drive iframe (no progress events possible — cross-origin)
   * - "notion"→ Notion edge proxy (single JSON fetch)
   * - "generic" → fallback
   */
  variant?: "pdf" | "archive" | "drive" | "notion" | "generic";
}

type ProgressPhase = "connecting" | "indexing" | "downloading" | "rendering" | "ready";

/**
 * Blocking overlay for reader loads.
 *
 * UX rules (per user feedback):
 * - Never show a spinner alone → always pair with a status line.
 * - When real `pdf-progress` events arrive, show the numeric percent
 *   instead of the generic "Opening from Google Drive…" copy.
 * - For sources that can't report progress (Drive iframe, Notion proxy),
 *   fall back to a simulated determinate curve so the user still sees a
 *   moving number instead of a "silent" spinner.
 */
const ReaderProgress = memo(({ visible, title, variant = "pdf" }: Props) => {
  const [fadingOut, setFadingOut] = useState(false);
  const [percent, setPercent] = useState<number>(0);
  /** Simulated fallback percent — only displayed until real bytes arrive. */
  const [simPercent, setSimPercent] = useState<number>(0);
  const [measured, setMeasured] = useState(false);
  const [phase, setPhase] = useState<ProgressPhase>(variant === "archive" ? "connecting" : "downloading");
  const [indeterminate, setIndeterminate] = useState(false);
  const simTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setPercent(0);
      setSimPercent(0);
      setMeasured(false);
      setPhase(variant === "archive" ? "connecting" : "downloading");
      setIndeterminate(false);
      return;
    }

    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ percent?: number; phase?: ProgressPhase }>).detail;
      const p = detail?.percent;
      if (detail?.phase) setPhase(detail.phase);
      if (typeof p === "number" && p >= 0) {
        setIndeterminate(false);
        setMeasured(true);
        setPercent((prev) => Math.max(prev, Math.min(99, Math.round(p))));
      } else if (p === -1) {
        setIndeterminate(true);
      }
    };
    const onReady = () => {
      setPercent(100);
      setMeasured(true);
      setPhase("ready");
      setIndeterminate(false);
      setFadingOut(true);
    };

    window.addEventListener("pdf-progress", onProgress as EventListener);
    window.addEventListener("pdf-ready", onReady);

    // Simulated progress so a number is ALWAYS visible — never a silent
    // spinner. For iframe/proxy sources (Drive/Notion) no byte events exist
    // at all, so the curve eases to 90%. For the canvas PDF path real bytes
    // usually arrive within a second, so the curve is deliberately slow
    // (caps at 40%) and is discarded the moment a measured percent lands.
    const start = Date.now();
    const ceiling = variant === "archive" ? 12 : variant === "pdf" ? 40 : 90;
    const tau = variant === "archive" ? 4 : variant === "pdf" ? 6 : 3;
    simTimerRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const eased = Math.round((1 - Math.exp(-elapsed / tau)) * ceiling);
      setSimPercent((prev) => Math.max(prev, eased));
    }, 200);

    return () => {
      window.removeEventListener("pdf-progress", onProgress as EventListener);
      window.removeEventListener("pdf-ready", onReady);
      if (simTimerRef.current) {
        window.clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    };
  }, [visible, variant]);

  if (!visible && !fadingOut) return null;

  // Real bytes win as soon as we have them; otherwise show the simulated
  // curve so the user always sees a moving number (never a bare "…").
  const shown = measured ? percent : Math.max(percent, simPercent);

  const baseLabel = title ? `Opening ${title}` : "Opening document";
  const phaseLabel = phase === "connecting"
    ? "Connecting to Archive.org"
    : phase === "indexing"
      ? "Reading document index"
      : phase === "rendering"
        ? "Preparing first page"
        : baseLabel;
  const label = shown > 0 ? `${phaseLabel} — ${shown}%` : `${phaseLabel}…`;

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background transition-opacity duration-300 ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      onTransitionEnd={() => {
        if (fadingOut) setFadingOut(false);
      }}
    >
      <SpokeSpinner />
      <p className="text-sm text-muted-foreground text-center px-6 max-w-xs tabular-nums">
        {label}
      </p>
      {/* Determinate bar — sized for touch-target legibility (Linear-style
          load indicator, 6px tall × 64 wide). A minimum 6% "seed" width
          keeps the primary color visible even at 0% so users can see the
          rail is real, not an empty placeholder. */}
      <div
        className="h-1.5 w-64 overflow-hidden rounded-full bg-border/70 ring-1 ring-border/50"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
      >
        <div
          className={`h-full bg-primary transition-[width] duration-300 ease-out ${indeterminate && !measured ? "motion-safe:animate-pulse" : ""}`}
          style={{ width: `${Math.max(shown, 6)}%` }}
        />
      </div>
    </div>
  );
});

ReaderProgress.displayName = "ReaderProgress";
export default ReaderProgress;
