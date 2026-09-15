import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePortalHost } from "../../hooks/usePortalHost";
import { ChevronUp, ChevronDown } from "lucide-react";
import { tapHaptic, selectionHaptic } from "../../lib/native/haptics";
import { recordDiagnostic } from "../../lib/freezeDiagnostics";

/** Track starts below the reader header so the chip never sits on the toolbar. */
const TRACK_TOP = 104;
/** …and stops above the bottom FAB stack. */
const TRACK_BOTTOM = 72;
/** Movement (px) that turns a press into a scrub instead of a tap. */
const DRAG_THRESHOLD = 6;
/** Consecutive bridge failures before we record one diagnostic. */
const BRIDGE_FAILURE_LIMIT = 3;

/** Consecutive `postMessage` failures to the pdf.js iframe. A permanently
 *  dead bridge used to be invisible (every call sat behind a silent `catch {}`),
 *  so the chevrons and scrub simply did nothing with no trace anywhere. */
let bridgeFailures = 0;
let bridgeReported = false;

/** Post to the pdf.js iframe, counting failures so a dead bridge is visible.
 *  Returns true when the message was handed to the iframe. */
function postToReader(
  iframe: HTMLIFrameElement | null | undefined,
  message: Record<string, unknown>,
): boolean {
  try {
    const win = iframe?.contentWindow;
    if (!win) throw new Error("no contentWindow");
    win.postMessage(message, "*");
    bridgeFailures = 0;
    bridgeReported = false;
    return true;
  } catch (err) {
    bridgeFailures += 1;
    if (bridgeFailures >= BRIDGE_FAILURE_LIMIT && !bridgeReported) {
      bridgeReported = true;
      recordDiagnostic(
        "error",
        `page-indicator bridge dead: ${bridgeFailures} consecutive postMessage failures (${String(message.type)})`,
        err,
      );
    }
    return false;
  }
}


interface Props {
  /** Same-origin scroller (canvas reader). */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** pdf.js iframe surface. */
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  /** Fade-out delay after the last scroll (ms). */
  idleMs?: number;
  /** Keep the chip on screen regardless of idle (reader chrome is visible). */
  pinned?: boolean;
}

interface PageState {
  first: number;
  last: number;
  total: number;
}

/**
 * Google-Drive-style floating page indicator.
 *
 * Shows `7–9/17` on the right edge while the reader is scrolling (user scroll
 * or autoscroll) and fades out after ~1.2s of stillness. The stacked chevrons
 * jump to the previous / next page boundary.
 *
 * Perf: the scroll handler is passive and rAF-throttled, page rects are cached
 * and re-measured at most every 500ms, and every timer/listener is torn down
 * on unmount (see the app-crash-shield leak rules).
 */
export default function PageIndicatorPill({
  targetRef,
  iframeRef,
  idleMs = 1200,
  pinned = false,
}: Props): JSX.Element | null {
  const host = usePortalHost();
  const [state, setState] = useState<PageState | null>(null);
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  /** 0..1 position of the thumb along the scrub track. */
  const [fraction, setFraction] = useState(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  /** Which caret is emphasised: the one pointing where the reader is heading. */
  const [direction, setDirection] = useState<"down" | "up">("down");
  /** Last observed scroll offset (px or page number) used to derive direction. */
  const lastPos = useRef(0);

  const hideTimer = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pagesRef = useRef<{ page: number; top: number; bottom: number }[]>([]);
  const measuredAt = useRef(0);
  const mounted = useRef(true);
  /** Until this timestamp the drag owns `fraction`; page reports must not fight it. */
  const scrubUntil = useRef(0);

  /** Emphasise the caret matching the travel direction; ignore sub-pixel noise. */
  const noteDirection = useCallback((pos: number, epsilon: number) => {
    const delta = pos - lastPos.current;
    if (Math.abs(delta) < epsilon) return;
    lastPos.current = pos;
    setDirection(delta > 0 ? "down" : "up");
  }, []);



  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const reveal = useCallback(() => {
    if (!mounted.current) return;
    setShown(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (mounted.current) setShown(false);
    }, idleMs);
  }, [idleMs]);

  // ── Same-origin canvas reader ───────────────────────────────────────────
  const measure = useCallback((el: HTMLElement, now: number, force = false) => {
    // NOTE: never fake `now` to force a re-measure — that writes a future
    // timestamp and silently skips the next real measures (stale page rects).
    if (!force && now - measuredAt.current < 500 && pagesRef.current.length) return;
    measuredAt.current = now;
    const rootTop = el.getBoundingClientRect().top - el.scrollTop;
    pagesRef.current = Array.from(
      el.querySelectorAll<HTMLElement>("[data-page]")
    )
      .map((node, i) => {
        const r = node.getBoundingClientRect();
        const page = Number(node.dataset.page) || i + 1;
        return { page, top: r.top - rootTop, bottom: r.bottom - rootTop };
      })
      .sort((a, b) => a.top - b.top);
  }, []);

  // Soft-touch: one selection tick per page boundary crossed while scrubbing.
  const lastPulsedPage = useRef(0);
  const pulsePage = useCallback((page: number) => {
    if (!draggingRef.current) {
      lastPulsedPage.current = page;
      return;
    }
    if (page === lastPulsedPage.current) return;
    lastPulsedPage.current = page;
    void selectionHaptic();
  }, []);

  const compute = useCallback(
    (el: HTMLElement) => {
      measure(el, performance.now());
      const pages = pagesRef.current;
      if (!pages.length) return;
      const viewTop = el.scrollTop;
      const viewBottom = viewTop + el.clientHeight;
      const visible = pages.filter((p) => p.bottom > viewTop + 4 && p.top < viewBottom - 4);
      const list = visible.length ? visible : [pages[0]];
      const first = list[0].page;
      setState({
        first,
        last: list[list.length - 1].page,
        total: pages.length,
      });
      const max = el.scrollHeight - el.clientHeight;
      setFraction(max > 2 ? Math.max(0, Math.min(1, el.scrollTop / max)) : 0);
      noteDirection(el.scrollTop, 2);
      pulsePage(first);
    },
    [measure, noteDirection, pulsePage]
  );


  useEffect(() => {
    const el = targetRef?.current ?? null;
    if (!el) return;
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!mounted.current) return;
        compute(el);
        reveal();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // Seed once so the first reveal already has a number.
    compute(el);
    return () => el.removeEventListener("scroll", onScroll);
    // `targetRef.current` intentionally omitted: ref mutations don't re-render.
    // Mount sites remount this component (surfaceTick key) when the surface
    // resolves, which is what re-runs this effect.
     
  }, [targetRef, compute, reveal]);

  // ── pdf.js iframe surface ───────────────────────────────────────────────
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // Only trust the reader iframe we own, on our own origin. Any other
      // frame (ad slot, opener, injected iframe) must not drive page state.
      const src = iframeRef?.current?.contentWindow ?? null;
      if (!src || e.source !== src) return;
      if (e.origin !== "null" && e.origin !== window.location.origin) return;
      const d = e?.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "nb-page-state") {
        const total = Number(d.total) || 0;
        const first = Number(d.first) || 1;
        const last = Number(d.last) || first;
        if (!total) return;
        setState({ first, last, total });
        // While the finger owns the thumb — and for a moment after release —
        // its position is driven by the drag, not by the (page-quantised,
        // slightly lagging) report from the iframe.
        if (!draggingRef.current && performance.now() > scrubUntil.current && total > 1) {
          setFraction(Math.max(0, Math.min(1, (first - 1) / (total - 1))));
        }
        // The iframe reports page numbers, not pixels, so one page of travel
        // is the smallest meaningful step.
        noteDirection(first, 1);
        pulsePage(first);
        reveal();

      } else if (d.type === "nb-pdf-pagesloaded") {
        const total = Number(d.pages) || 0;
        if (total) setState((prev) => ({ first: prev?.first ?? 1, last: prev?.last ?? 1, total }));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [reveal, iframeRef, noteDirection, pulsePage]);


  const step = useCallback(
    (delta: 1 | -1) => {
      reveal();
      const el = targetRef?.current ?? null;
      if (el && el.scrollHeight - el.clientHeight > 2) {
        measure(el, performance.now(), true); // force a fresh measure
        const pages = pagesRef.current;

        if (!pages.length) return;
        const cur = el.scrollTop;
        const next =
          delta > 0
            ? pages.find((p) => p.top > cur + 4)
            : [...pages].reverse().find((p) => p.top < cur - 4);
        const prevBehavior = el.style.scrollBehavior;
        el.style.scrollBehavior = "auto";
        el.scrollTop = next ? Math.max(0, next.top) : delta > 0 ? el.scrollHeight : 0;
        el.style.scrollBehavior = prevBehavior;
        compute(el);
        return;
      }
      postToReader(iframeRef?.current, { type: "nb-goto-page", delta });

    },
    [targetRef, iframeRef, measure, compute, reveal]
  );

  // ── Drag-to-scrub on the chip (scrollbar-thumb behaviour) ───────────────
  // The chip travels along a vertical track and stays exactly under the touch
  // point for the whole gesture: `fraction` is derived from the absolute
  // pointer Y minus the grab offset, not from a synthetic travel constant.
  const dragRef = useRef<{
    grabOffset: number;
    id: number;
    moved: boolean;
    /** Pointer Y at grab time — the fixed origin for the tap/drag threshold. */
    originY: number;
  } | null>(null);
  const dragRaf = useRef<number | null>(null);
  const pendingY = useRef(0);

  const trackMetrics = useCallback(() => {
    const h = typeof window === "undefined" ? 0 : window.innerHeight;
    const top = TRACK_TOP;
    const length = Math.max(1, h - TRACK_TOP - TRACK_BOTTOM);
    return { top, length };
  }, []);

  const applyFraction = useCallback(
    (next: number) => {
      const f = Math.max(0, Math.min(1, next));
      setFraction(f);
      scrubUntil.current = performance.now() + 250;
      const el = targetRef?.current ?? null;
      if (el && el.scrollHeight - el.clientHeight > 2) {
        const prev = el.style.scrollBehavior;
        el.style.scrollBehavior = "auto";
        el.scrollTop = f * (el.scrollHeight - el.clientHeight);
        el.style.scrollBehavior = prev;
        compute(el);
        setFraction(f); // compute() re-derives from scrollTop; the drag wins
        return;
      }
      postToReader(iframeRef?.current, { type: "nb-scroll-to-fraction", fraction: f });

    },
    [targetRef, iframeRef, compute]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      const { top, length } = trackMetrics();
      const thumbY = top + fraction * length;
      dragRef.current = {
        grabOffset: e.clientY - thumbY,
        id: e.pointerId,
        moved: false,
        originY: e.clientY,
      };
      draggingRef.current = true;
      setDragging(true);
      scrubUntil.current = performance.now() + 250;
      void selectionHaptic();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      // Autoscroll writes scrollTop every frame too — pause it for the drag,
      // otherwise the page snaps back under the finger.
      window.dispatchEvent(new CustomEvent("nb-reader-scrub-start"));
      postToReader(iframeRef?.current, { type: "nb-autoscroll-user-activity" });

      reveal();
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [trackMetrics, fraction, reveal, iframeRef]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const { top, length } = trackMetrics();
      // Threshold is measured from the fixed grab origin — comparing against
      // the live `fraction` (which the drag is already moving) swallowed
      // short scrubs.
      if (!d.moved && Math.abs(e.clientY - d.originY) < DRAG_THRESHOLD) return;
      d.moved = true;
      pendingY.current = e.clientY - d.grabOffset;
      if (dragRaf.current) return;
      dragRaf.current = requestAnimationFrame(() => {
        dragRaf.current = null;
        if (!mounted.current || !dragRef.current) return;
        applyFraction((pendingY.current - top) / length);
      });
    },
    [applyFraction, trackMetrics]
  );

  const releaseDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    draggingRef.current = false;
    setDragging(false);
    scrubUntil.current = performance.now() + 250;
    if (dragRaf.current) {
      cancelAnimationFrame(dragRaf.current);
      dragRaf.current = null;
    }
    window.dispatchEvent(new CustomEvent("nb-reader-scrub-end"));
    reveal();
  }, [reveal]);

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      releaseDrag();
    },
    [releaseDrag]
  );

  // Safety net: a gesture that ends outside the chip (capture lost, pointer
  // released over the iframe) must still resume autoscroll.
  useEffect(() => {
    const onUp = () => releaseDrag();
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [releaseDrag]);


  // Keyboard path to page stepping (the pointer stepper is touch-only).
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        step(1);
      }
    },
    [step]
  );


  useEffect(
    () => () => {
      if (dragRaf.current) cancelAnimationFrame(dragRaf.current);
    },
    []
  );

  if (!state || state.total <= 1) return null;

  // Minimal label: just the current page over the total. The `first–last`
  // range made the chip wide and its width jittered on every scroll frame.
  const label = `${state.first}/${state.total}`;

  // Keyboard focus keeps the pill visible and interactive even when idle.
  const visible = shown || focused || dragging || pinned;
  const surface =
    "rounded-full bg-foreground/85 text-background shadow-md backdrop-blur";

  // Idle → the chip disappears completely. A 30%-opacity ghost stayed legible
  // over light PDF pages and, worse, its children kept `pointer-events-auto`,
  // so an invisible strip along the right edge swallowed taps meant for the
  // page underneath. `interactive` gates the fade and the hit area together.
  const interactive = visible ? "pointer-events-auto" : "pointer-events-none";

  const node = (
    <div
      className={`pointer-events-none fixed right-2 z-[67] flex max-w-[calc(100%-1rem)] -translate-y-1/2 flex-row items-center transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        // Thumb rides the track at the document's scroll fraction, so the chip
        // stays under the finger while scrubbing (Files-by-Google behaviour).
        // The track starts below the header, so the chip can never overlap the
        // toolbar icons or get clipped by the notch band.
        top: `${trackMetrics().top + fraction * trackMetrics().length}px`,
        marginRight: "env(safe-area-inset-right, 0px)",
      }}
      onFocus={() => {
        setFocused(true);
        reveal();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {/* One surface for both controls. The stepper used to be a separate
          floating capsule with its own height animation next to the chip — mid
          transition it read as a stray dark blob crowding the page number, and
          on narrow screens the two capsules visually collided. A single pill
          (stepper column | page label) keeps one shadow, one radius, and can
          never overlap itself. */}
      <div
        className={`${interactive} flex items-stretch overflow-hidden ${surface} ${
          dragging ? "scale-105" : ""
        } h-11 transition-transform duration-150 ease-out`}
      >
        {/* Stepper is secondary: kept mounted (not unmounted) so focus, tests
            and assistive tech always find it, but hidden from a11y and
            non-interactive while the pill is faded out. */}
        {/* 32px column with vertical padding and centred icons: at `h-11` the
            pill's 22px corner radius used to slice the top and bottom of this
            column, so the caret pushed to the extreme edge (`items-end` /
            `items-start`) disappeared behind the round mask. */}
        <div aria-hidden={!visible} className="nb-tap-exempt flex h-full w-8 shrink-0 flex-col py-1 pl-0.5 border-r border-background/20">
          <button
            type="button"
            aria-label="Previous page"
            onClick={(e) => {
              e.stopPropagation();
              void tapHaptic("light");
              step(-1);
            }}
            className={`flex flex-1 items-center justify-center rounded-l-xl outline-none transition-[color,background-color,opacity] duration-150 focus-visible:bg-background/20 active:bg-background/25 ${
              direction === "up" ? "opacity-100" : "opacity-55"
            }`}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next page"
            onClick={(e) => {
              e.stopPropagation();
              void tapHaptic("light");
              step(1);
            }}
            className={`flex flex-1 items-center justify-center rounded-l-xl outline-none transition-[color,background-color,opacity] duration-150 focus-visible:bg-background/20 active:bg-background/25 ${
              direction === "down" ? "opacity-100" : "opacity-55"
            }`}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

        </div>

        {/* Drag surface doubles as the label — the whole 44px-tall area is the
            scrub target, so the touch target is legal without a transparent
            wrapper that used to add invisible padding beside the pill. */}
        <span
          role="slider"
          aria-label="Scrub pages"
          aria-valuemin={1}
          aria-valuemax={state.total}
          aria-valuenow={state.first}
          aria-valuetext={label}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={releaseDrag}
          style={{ touchAction: "none" }}
          className="flex select-none items-center px-2.5 text-xs font-medium leading-none tabular-nums outline-none focus-visible:bg-background/20"
        >
          {label}
        </span>
      </div>
    </div>
  );



  if (typeof document === "undefined") return node;
  return createPortal(node, host ?? document.body) as unknown as JSX.Element;
}
