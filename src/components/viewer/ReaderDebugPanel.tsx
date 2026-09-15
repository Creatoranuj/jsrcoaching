import { useEffect, useState } from "react";
import {
  getReaderEvents,
  readerTraceSummary,
  setReaderTraceEnabled,
  subscribeReaderEvents,
} from "@/lib/perf/marks";

/**
 * Dev-only reader diagnostics: autoscroll tick drift, dropped frames, the
 * element currently acting as scroll host, keyboard inset, and the last ten
 * Shuffle transitions.
 *
 * Rendered lazily and only when tracing is enabled, so it is zero-cost in
 * normal sessions.
 */
export default function ReaderDebugPanel({ keyboardInset = 0 }: { keyboardInset?: number }) {
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setReaderTraceEnabled(true);
    const unsub = subscribeReaderEvents(() => force((n) => n + 1));
    return () => {
      unsub();
      setReaderTraceEnabled(false);
    };
  }, []);

  const s = readerTraceSummary();
  const events = getReaderEvents().slice(-10).reverse();

  return (
    <div
      data-testid="reader-debug-panel"
      className="fixed left-2 z-[90] max-w-[70vw] rounded-lg border border-border bg-card/95 px-2 py-1 font-mono text-[10px] text-foreground shadow-lg backdrop-blur"
      style={{ bottom: 8 + keyboardInset }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left font-semibold"
      >
        reader · drift {s.tickDriftMs.toFixed(1)}ms · drop {s.droppedFrames} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          <div>host: {s.host}</div>
          <div>render avg: {s.avgRenderMs.toFixed(1)}ms</div>
          <div>keyboard inset: {Math.round(keyboardInset)}px</div>
          <div className="pt-1 opacity-70">last events</div>
          {events.map((e, i) => (
            <div key={`${e.t}-${i}`}>
              {e.kind}
              {typeof e.ms === "number" ? ` ${e.ms.toFixed(1)}ms` : ""}
              {e.detail ? ` ${e.detail}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
