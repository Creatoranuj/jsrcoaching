import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { safeGet, safeSet } from "../lib/storage";
import {
  DEFAULT_DWELL,
  clampDwellSeconds,
  crossedTarget,
  dwellTargets,
  pageStops,
  isRouteMode,
  parseDwell,
  parsePageList,
  parseRouteList,
  waypointReached,
  MAX_LIST_LENGTH,
  type DwellParity,
  type DwellSettings,
  type PageBox,

} from "../lib/reader/dwellEngine";
import {
  FromBridge,
  ToBridge,
  isTrustedBridgeMessage,
  postToBridge,
} from "../lib/reader/bridgeProtocol";
import { inferGrade } from "../lib/reader/fsrsScheduler";
import { recordReview } from "../lib/reader/shuffleDeck";
import { recordReaderEvent } from "../lib/perf/marks";


/** Hard ceiling for autoscroll speed (multiples of ~1px per 16.67ms frame). */
export const MAX_AUTOSCROLL_SPEED = 20;

const SPEED_KEY = "nb_autoscroll_speed";
const perDocSpeedKey = (k: string) => `nb_autoscroll_speed:${k}`;
const perDocActiveKey = (k: string) => `nb_autoscroll_active:${k}`;
const REVERSE_KEY = "nb_autoscroll_reverse";
const DWELL_KEY = "nb_autoscroll_dwell";
const perDocReverseKey = (k: string) => `nb_autoscroll_reverse:${k}`;
const perDocDwellKey = (k: string) => `nb_autoscroll_dwell:${k}`;

// Re-exported so existing importers (AutoScrollFab, tests) keep one entry point
// while the algorithm itself lives in the shared, unit-tested module.
export { parsePageList, parseRouteList };
export type { DwellParity, DwellSettings };




export interface AutoScrollOptions {
  /** DOM element to scroll (same-origin markdown / native scrollers). */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** Iframe element (cross-origin PDF/Doc viewers). Used as keystroke fallback. */
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  /** Stable per-document id — enables per-doc speed + auto-resume via localStorage. */
  docKey?: string;
}

/**
 * Autoscroll engine.
 * - Single tap → toggle (caller wires `toggle()` to onClick).
 * - Long-press → caller opens speed picker, then calls `setSpeed(...)`.
 * - Persists chosen speed in localStorage (global + per-doc when `docKey` given).
 * - When `docKey` is provided, remembers active-state per-doc and auto-resumes on remount.
 * - For same-origin scrollers we increment scrollTop on rAF.
 * - For cross-origin iframes we send periodic ArrowDown keydown events (best-effort).
 */
export function useAutoScroll({ targetRef, iframeRef, docKey }: AutoScrollOptions) {
  const [active, setActive] = useState(false);
  const [speed, _setSpeed] = useState<number>(() => {
    const perDoc = docKey ? safeGet(perDocSpeedKey(docKey)) : "";
    const s = parseFloat(perDoc || safeGet(SPEED_KEY) || "");
    return Number.isFinite(s) && s > 0 ? s : 1;
  });
  const [reverse, _setReverse] = useState<boolean>(() => {
    const perDoc = docKey ? safeGet(perDocReverseKey(docKey)) : "";
    return (perDoc || safeGet(REVERSE_KEY) || "0") === "1";
  });
  const [dwell, _setDwell] = useState<DwellSettings>(() =>
    (docKey ? parseDwell(safeGet(perDocDwellKey(docKey))) : null) ??
    parseDwell(safeGet(DWELL_KEY)) ??
    DEFAULT_DWELL
  );
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  /**
   * Authoritative float scroll position. `scrollTop` is snapped to whole
   * device pixels on read-back in Android WebView, so using it as the source
   * of truth silently destroyed sub-pixel deltas (0.1–0.5x barely moved).
   * We own the position as a float and only ever *write* it to the element.
   */
  const posRef = useRef<number>(0);
  /** Restores the target's inline scroll-behavior when the engine stops. */
  const prevScrollBehaviorRef = useRef<string | null>(null);
  const behaviorElRef = useRef<HTMLElement | null>(null);
  const iframeTickRef = useRef<number | null>(null);
  /** Element receiving the sub-pixel `translate3d` remainder while running. */
  const smoothElRef = useRef<HTMLElement | null>(null);
  const prevTransformRef = useRef<string | null>(null);
  const msgHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const supportTimerRef = useRef<number | null>(null);
  /** Mirrors `active` so callbacks/loops never read a stale closure value. */
  const activeRef = useRef(false);
  /** True while the user holds to pause (engine stopped, state stays active). */
  const pausedRef = useRef(false);
  /** Live speed for the running loop — avoids restarting the engine on change. */
  const speedRef = useRef(speed);
  /** ms spent parked at the bottom — guards against premature auto-stop. */
  const endWaitRef = useRef(0);
  /** Direction + repeat-mode mirrors for the running loop. */
  const dirRef = useRef(reverse ? -1 : 1);
  const dwellRef = useRef(dwell);
  /** Timestamp (rAF clock) until which the loop is parked on a page. */
  const dwellUntilRef = useRef(0);
  /** Last page number we already paused on — prevents re-triggering. */
  const dwellPageRef = useRef<number | null>(null);
  /** Direction the last dwell was recorded in (resets the guard on reverse). */
  const dwellDirRef = useRef(reverse ? -1 : 1);
  /** Identity ("page:slice") of the last target we already paused on. */
  const dwellKeyRef = useRef<string | null>(null);
  /** Index of the current waypoint when `parity === "route"`. */
  const routeIdxRef = useRef(0);
  /** Screenful slice index inside the current waypoint page (A4 mode). */
  const routeStopRef = useRef(0);
  /**
   * Open visit for the Shuffle (FSRS) deck: which page we are parked on and
   * since when. Closing a visit turns dwell-time into an implicit Anki grade —
   * the reader never sees Again/Hard/Good/Easy buttons.
   */
  const visitRef = useRef<{ page: number; at: number } | null>(null);
  /** Pages already visited in this session — a revisit grades as "Again". */
  const visitedRef = useRef<Set<number>>(new Set());





  /**
   * Mirror the dwell config into the pdf.js iframe bridge. The iframe path
   * runs its own scroll loop inside the viewer, so pause-on-pages has to be
   * enforced there (the same-origin canvas loop handles it inline below).
   */
  const pushDwellToIframe = useCallback((cfg: DwellSettings) => {
    postToBridge(iframeRef?.current, { type: ToBridge.dwell, dwell: cfg });
  }, [iframeRef]);

  /**
   * Arrival at a Shuffle waypoint. Closes the previous page's visit and grades
   * it: time actually spent ÷ the configured pause. Holding to pause, scrubbing
   * back, or lingering all stretch the visit — exactly the "I didn't know this"
   * signal FSRS wants. Runs on both engines (canvas loop + pdf.js bridge).
   */
  const gradeVisit = useCallback((page: number, at: number, now: number) => {
    const cfg = dwellRef.current;
    const expected = Math.max(1, cfg.seconds) * 1000;
    const grade = inferGrade((now - at) / expected, visitedRef.current.has(page));
    visitedRef.current.add(page);
    recordReview(docKey, page, grade, now);
  }, [docKey]);

  /**
   * Closes the open visit when the pause on a page ends. Grading happens here —
   * not on arrival at the next waypoint — so only the time actually *parked* on
   * the page counts. Travelling between waypoints would otherwise inflate every
   * ratio past 2 and grade every page "Again".
   */
  const closeShuffleVisit = useCallback(() => {
    const open = visitRef.current;
    if (!open || !docKey || dwellRef.current.parity !== "shuffle") return;
    visitRef.current = null;
    recordReaderEvent("shuffle", { detail: `idle p${open.page}` });
    gradeVisit(open.page, open.at, Date.now());
  }, [docKey, gradeVisit]);

  const noteShuffleVisit = useCallback((page: number) => {
    if (!docKey || !Number.isFinite(page) || page <= 0) return;
    const cfg = dwellRef.current;
    if (cfg.parity !== "shuffle") return;
    recordReaderEvent("shuffle", { detail: `scheduling p${page}` });
    const now = Date.now();
    const open = visitRef.current;
    if (open && open.page !== page) {
      // Left a page without its pause ever ending (manual jump / reshuffle).
      visitRef.current = null;
      gradeVisit(open.page, open.at, now);
    }
    if (!visitRef.current) visitRef.current = { page, at: now };
  }, [docKey, gradeVisit]);




  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { dirRef.current = reverse ? -1 : 1; }, [reverse]);
  useEffect(() => {
    dwellRef.current = dwell;
    pushDwellToIframe(dwell);
  }, [dwell, pushDwellToIframe]);


  /**
   * Picks the element that can carry the sub-pixel remainder for a scroller.
   * A scroll container can only land on whole device pixels, so at 0.1–0.5x
   * the page freezes for several frames and then jumps 1px. We keep the
   * integer part in `scrollTop` and paint the leftover fraction as a
   * compositor-only transform on the content wrapper, which makes low speeds
   * glide instead of staircase.
   *
   * Skipped when: reduced motion is requested, no suitable wrapper exists, or
   * the wrapper already carries a transform (pinch-zoom keeps priority).
   */
  const pickSmoothEl = (el: HTMLElement): HTMLElement | null => {
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
      const doc = el.querySelector<HTMLElement>(".react-pdf__Document");
      const candidate =
        doc ??
        (Array.from(el.children).find(
          (c) =>
            c instanceof HTMLElement &&
            getComputedStyle(c).position !== "sticky" &&
            getComputedStyle(c).position !== "fixed"
        ) as HTMLElement | undefined) ??
        null;
      if (!candidate) return null;
      const t = getComputedStyle(candidate).transform;
      if (t && t !== "none") return null; // zoomed / already transformed
      return candidate;
    } catch {
      return null;
    }
  };

  const clearSmoothing = () => {
    if (smoothElRef.current) {
      smoothElRef.current.style.transform = prevTransformRef.current ?? "";
      smoothElRef.current.style.willChange = "";
      smoothElRef.current = null;
      prevTransformRef.current = null;
    }
  };

  const setSpeed = useCallback((s: number) => {
    // Quantise to 2 decimals so 0.75 survives (the old *10 rounding made it 0.8).
    // Floor is 0.02x ("study crawl") — the sub-pixel remainder below keeps
    // motion continuous even at ~0.3px/frame, so ultra-slow still glides.
    // Ceiling is 20x ("skim") — mirrored by the slider max in AutoScrollFab.
    const clamped = Math.max(0.02, Math.min(MAX_AUTOSCROLL_SPEED, Math.round(s * 100) / 100));
    speedRef.current = clamped;
    _setSpeed(clamped);
    safeSet(SPEED_KEY, String(clamped));
    if (docKey) safeSet(perDocSpeedKey(docKey), String(clamped));
  }, [docKey]);

  const setReverse = useCallback((next: boolean) => {
    dirRef.current = next ? -1 : 1;
    _setReverse(next);
    safeSet(REVERSE_KEY, next ? "1" : "0");
    if (docKey) safeSet(perDocReverseKey(docKey), next ? "1" : "0");
  }, [docKey]);

  const setDwell = useCallback((patch: Partial<DwellSettings>) => {
    _setDwell((prev) => {
      const next: DwellSettings = {
        enabled: patch.enabled ?? prev.enabled,
        parity: patch.parity ?? prev.parity,
        seconds: clampDwellSeconds(patch.seconds ?? prev.seconds),
        pages: Array.from(new Set(patch.pages ?? prev.pages))
          .sort((a, b) => a - b)
          .slice(0, MAX_LIST_LENGTH),
        route: (patch.route ?? prev.route ?? []).slice(0, MAX_LIST_LENGTH),
        loopRoute: patch.loopRoute ?? prev.loopRoute ?? false,
        a4: patch.a4 ?? prev.a4 ?? false,
        shuffleFrom: Math.max(0, Math.floor(patch.shuffleFrom ?? prev.shuffleFrom ?? 0)),
        shuffleTo: Math.max(0, Math.floor(patch.shuffleTo ?? prev.shuffleTo ?? 0)),
      };



      dwellRef.current = next;
      dwellUntilRef.current = 0;
      dwellPageRef.current = null;
      dwellKeyRef.current = null;
      routeIdxRef.current = 0;
      routeStopRef.current = 0;
      // A settings change ends the open visit without grading it — a half
      // measured dwell would poison the deck.
      visitRef.current = null;



      const raw = JSON.stringify(next);
      safeSet(DWELL_KEY, raw);
      if (docKey) safeSet(perDocDwellKey(docKey), raw);
      return next;
    });
  }, [docKey]);

  // Plain boolean (not a type predicate): as a predicate it narrowed
  // `rawEl` to `never` on the false branch below, which broke the
  // descendant/ancestor fallbacks at typecheck time.
  const canScroll = (node: HTMLElement | null): boolean =>
    !!node && node.scrollHeight - node.clientHeight > 2;

  /**
   * Resolve the element that actually scrolls.
   *
   * Smart Notes and the inline PDF block hand us a *wrapper*: the real
   * scroller is either a child that mounts later (markdown body, pdf pages
   * container) or — for blocks that simply grow with the lesson page — the
   * document scroller itself. Binding blindly to the wrapper is why
   * autoscroll looked dead on those two surfaces: the loop measured
   * `scrollHeight - clientHeight === 0` and stopped on frame one.
   */
  const resolveTarget = (): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    const rawEl = targetRef?.current ?? null;
    if (canScroll(rawEl)) return rawEl;
    if (rawEl) {
      // 1) a scrollable descendant that mounted after the FAB did
      const inner = Array.from(
        rawEl.querySelectorAll<HTMLElement>(
          "[data-scroll-host], .nb-reader-surface, .markdown-body, .overflow-y-auto, .overflow-auto",
        ),
      ).find(canScroll);
      if (inner) return inner;
      // 2) nearest scrollable ancestor (reader shells wrap the content)
      let node: HTMLElement | null = rawEl.parentElement;
      while (node && node !== document.body && node !== document.documentElement) {
        if (canScroll(node)) return node;
        node = node.parentElement;
      }
    }
    // 3) the page itself — inline Smart Notes / inline PDF inside a normal
    //    (non-overflow) lesson section scroll the document, not a box.
    const doc = (document.scrollingElement ?? document.documentElement) as HTMLElement | null;
    if (doc && canScroll(doc)) return doc;
    return null;
  };


  /** Jump the reader back to the very top (page 1). Keeps autoscroll running. */
  const scrollToTop = useCallback(() => {
    const el = resolveTarget();
    const ifr = iframeRef?.current ?? null;
    dwellUntilRef.current = 0;
    dwellPageRef.current = null;
    dwellKeyRef.current = null;
    routeIdxRef.current = 0;
    routeStopRef.current = 0;
    endWaitRef.current = 0;


    lastTsRef.current = 0;
    if (el && el.scrollHeight - el.clientHeight > 2) {
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = "auto";
      el.scrollTop = 0;
      posRef.current = 0;
      if (smoothElRef.current) smoothElRef.current.style.transform = "translate3d(0, 0, 0)";
      // Restore only when the engine isn't currently owning the property.
      if (!activeRef.current) el.style.scrollBehavior = prev;
      return;
    }
    if (ifr) postToBridge(ifr, { type: ToBridge.top });
  }, [targetRef, iframeRef]);



  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    clearSmoothing();
    // Give the target its CSS scroll-behavior back.
    if (behaviorElRef.current) {
      behaviorElRef.current.style.scrollBehavior = prevScrollBehaviorRef.current ?? "";
      behaviorElRef.current = null;
      prevScrollBehaviorRef.current = null;
    }
    if (iframeTickRef.current != null) clearInterval(iframeTickRef.current);
    iframeTickRef.current = null;
    if (msgHandlerRef.current) {
      window.removeEventListener("message", msgHandlerRef.current);
      msgHandlerRef.current = null;
    }
    if (supportTimerRef.current != null) {
      window.clearTimeout(supportTimerRef.current);
      supportTimerRef.current = null;
    }
  }, []);

  /**
   * Single exit path: flip the ref first (loops read it synchronously), then
   * the state, then tear the engine down. Repeating these three lines by hand
   * is how a half-stopped run used to leak an rAF loop.
   */
  const deactivate = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    stop();
  }, [stop]);



  const start = useCallback(() => {
    stop();
    pausedRef.current = false;
    endWaitRef.current = 0;
    dwellUntilRef.current = 0;
    dwellPageRef.current = null;
    dwellKeyRef.current = null;
    routeIdxRef.current = 0;
    routeStopRef.current = 0;

    const ifr = iframeRef?.current ?? null;
    // A wrapper div that merely *contains* an iframe reports no scroll range.
    // Previously we still picked it and the loop stopped on the first frame
    // ("atEnd"), which is the main reason autoscroll looked dead on PDFs.
    const el = resolveTarget();
    const elScrollable = canScroll(el);
    // When a cross-origin viewer iframe is present, never fall back to the
    // page scroller — scrolling the lesson page instead of the PDF is worse
    // than using the iframe keystroke bridge.
    const isDocFallback =
      !!el && el === (document.scrollingElement ?? document.documentElement);
    const useEl = !!el && elScrollable && !(ifr && isDocFallback);
    if (useEl && el) {
      // Same-origin: smooth pixel scroll. speed = px per 16.67ms (60fps baseline).
      // `scroll-behavior: smooth` (set globally on <html> and on some readers)
      // turns every per-frame scrollTop write into a *new* smooth-scroll
      // animation request. 60 overlapping animations/sec = guaranteed stutter.
      // Force `auto` while running and restore it in stop().
      behaviorElRef.current = el;
      prevScrollBehaviorRef.current = el.style.scrollBehavior;
      el.style.scrollBehavior = "auto";
      lastTsRef.current = 0;
      posRef.current = el.scrollTop;
      // Attach the sub-pixel smoothing wrapper (see pickSmoothEl). Re-picked
      // lazily inside the loop because the PDF Document mounts after start().
      let smoothChecked = false;
      // Virtualization guard state — recomputed at most every 150ms instead of
      // running a full querySelectorAll on every single animation frame.
      let pendingUntil = 0;
      let pendingCached = false;
      // Cached page boxes (relative to the scroller's content) for repeat mode.
      let pageTops: PageBox[] = [];
      let pageTopsAt = 0;
      // Derived dwell targets. In A4 mode one page can expand into many
      // screenful stops, so rebuilding this list on every animation frame
      // would allocate hundreds of objects per second on a long scan.
      let targetsCache: ReturnType<typeof dwellTargets> = [];
      let targetsKey = "";
      const measurePages = () => {
        const rootTop = el.getBoundingClientRect().top - el.scrollTop;
        pageTops = Array.from(el.querySelectorAll<HTMLElement>(".react-pdf__Page"))
          .map((node, i) => {
            const num = Number(node.dataset.pageNumber) || i + 1;
            const rect = node.getBoundingClientRect();
            return { page: num, top: rect.top - rootTop, height: rect.height };
          })

          .sort((a, b) => a.top - b.top);
        targetsKey = "";
      };
      const currentTargets = (cfg: DwellSettings) => {
        const key = `${el.clientHeight}|${cfg.a4}|${cfg.parity}|${cfg.pages.join(",")}|${pageTops.length}`;
        if (key !== targetsKey) {
          targetsKey = key;
          targetsCache = dwellTargets(pageTops, cfg, el.clientHeight);
        }
        return targetsCache;
      };

      const step = (ts: number) => {
        if (!lastTsRef.current) lastTsRef.current = ts;
        const frameMs = ts - lastTsRef.current;
        const dt = Math.min(4, frameMs / 16.67); // cap dt to avoid jumps after tab-away
        lastTsRef.current = ts;
        // Frame lag + tick drift for the reader debug panel (no-op when the
        // trace flag is off — one boolean read per frame).
        recordReaderEvent("frame", { ms: frameMs });
        recordReaderEvent("tick", { ms: Math.abs(frameMs - 16.67) });
        // Repeat mode: parked on a page boundary — hold position this frame.
        if (dwellUntilRef.current && ts < dwellUntilRef.current) {
          posRef.current = el.scrollTop;
          rafRef.current = requestAnimationFrame(step);
          return;
        }
        if (dwellUntilRef.current && ts >= dwellUntilRef.current) {
          dwellUntilRef.current = 0;
          closeShuffleVisit();
        }

        const max = el.scrollHeight - el.clientHeight;
        if (max > 2) {
          // The user (or a programmatic jump) moved the scroller out from
          // under us — re-seed instead of fighting them.
          if (Math.abs(el.scrollTop - posRef.current) > 2) posRef.current = el.scrollTop;
          // Large Archive scans virtualize canvases to keep WebView memory flat.
          // If the next page slot has entered the viewport but its canvas is
          // still decoding, hold position for this frame. This prevents
          // autoscroll from outrunning PDF.js and queuing many image decodes.
          if (el.dataset.archiveVirtualized === "true") {
            if (ts >= pendingUntil) {
              pendingUntil = ts + 150;
              // getBoundingClientRect is measured against the scroller's own
              // viewport, so a zoom `transform` on the pages wrapper (which
              // makes it a containing block and breaks offsetTop) can't send
              // this guard into a permanent "pending" freeze.
              const rootTop = el.getBoundingClientRect().top;
              pendingCached = Array.from(
                el.querySelectorAll<HTMLElement>('[data-page-rendered="false"]')
              ).some((page) => {
                const top = page.getBoundingClientRect().top - rootTop;
                return top >= -240 && top <= el.clientHeight + 240;
              });
            }
            if (pendingCached) {
              posRef.current = el.scrollTop;
              rafRef.current = requestAnimationFrame(step);
              return;
            }
          }
          const cfg = dwellRef.current;
          const routeMode = isRouteMode(cfg);

          // Route mode owns the direction: each leg heads toward the next
          // waypoint, so the sign flips automatically (6 ↓ → 3 ↑ → 8 ↓ → 2 ↑).
          let routeTarget: number | null = null;
          let routeStops: number[] = [];
          if (routeMode) {
            if (ts - pageTopsAt > 500 || pageTops.length === 0) {
              pageTopsAt = ts;
              measurePages();
            }
            const wanted = cfg.route[routeIdxRef.current % cfg.route.length];
            const hit = pageTops.find((p) => p.page === wanted);
            if (hit) {
              // A4 mode reads the waypoint page screenful by screenful before
              // heading to the next waypoint.
              routeStops = cfg.a4
                ? pageStops(hit.top, hit.height, el.clientHeight)
                : [hit.top];
              const idx = Math.min(routeStopRef.current, routeStops.length - 1);
              routeTarget = routeStops[idx];
              const delta = routeTarget - posRef.current;
              if (Math.abs(delta) > 0.5) dirRef.current = delta > 0 ? 1 : -1;
            }
          }
          // Accumulate into the float position and write it every frame. The
          // fractional remainder is never discarded, so 0.1x advances exactly
          // ~6px/sec instead of stalling on integer snapping.
          const prevPos = posRef.current;
          posRef.current = Math.max(
            0,
            Math.min(max, posRef.current + speedRef.current * dt * dirRef.current)
          );
          const whole = Math.floor(posRef.current);
          el.scrollTop = whole;
          if (routeMode) {
            if (routeTarget != null) {
              const reached = waypointReached(prevPos, posRef.current, routeTarget);
              if (reached) {
                posRef.current = routeTarget;
                el.scrollTop = Math.floor(routeTarget);
                dwellUntilRef.current = ts + cfg.seconds * 1000;
                noteShuffleVisit(cfg.route[routeIdxRef.current % cfg.route.length]);

                // More screenfuls left on this page → stay on this waypoint.
                if (routeStopRef.current < routeStops.length - 1) {
                  routeStopRef.current += 1;
                  rafRef.current = requestAnimationFrame(step);
                  return;
                }
                routeStopRef.current = 0;
                const last = routeIdxRef.current >= cfg.route.length - 1;
                if (last && !cfg.loopRoute) {
                  deactivate();
                  return;
                }
                routeIdxRef.current = last ? 0 : routeIdxRef.current + 1;
                rafRef.current = requestAnimationFrame(step);
                return;
              }
            }
          } else if (cfg.enabled && cfg.seconds > 0) {
            // Repeat mode: pause when a matching page boundary (or, in A4
            // mode, a screenful slice of it) crosses the top edge of the
            // viewport, then resume automatically after the dwell.
            if (ts - pageTopsAt > 500 || pageTops.length === 0) {
              pageTopsAt = ts;
              measurePages();
            }
            // Reverse autoscroll must be able to pause again on a page it
            // already paused on while going down, so the "already used"
            // guard is scoped to the current direction.
            if (dwellDirRef.current !== dirRef.current) {
              dwellDirRef.current = dirRef.current;
              dwellPageRef.current = null;
              dwellKeyRef.current = null;
            }
            // Travelling up → park on the last target we passed.
            const targets = currentTargets(cfg);
            const crossed = crossedTarget(targets, prevPos, posRef.current, dirRef.current);

            if (crossed && dwellKeyRef.current !== crossed.key) {
              dwellKeyRef.current = crossed.key;
              dwellPageRef.current = crossed.page;
              dwellUntilRef.current = ts + cfg.seconds * 1000;
              posRef.current = crossed.top;
              el.scrollTop = Math.floor(crossed.top);
              rafRef.current = requestAnimationFrame(step);
              return;
            }
          }



          if (!smoothChecked && !smoothElRef.current) {
            const cand = pickSmoothEl(el);
            if (cand) {
              smoothElRef.current = cand;
              prevTransformRef.current = cand.style.transform;
              cand.style.willChange = "transform";
            }
            // Retry once content mounts; stop probing after the first hit.
            smoothChecked = !!cand;
          }
          if (smoothElRef.current) {
            const frac = posRef.current - whole;
            smoothElRef.current.style.transform = `translate3d(0, ${-frac}px, 0)`;
          }
          const atEdge = dirRef.current < 0 ? posRef.current <= 1 : posRef.current >= max - 1;
          if (atEdge) {
            // Reached the end of what's rendered so far. Lazy readers (pdf.js,
            // markdown, infinite lists) grow later — idle instead of killing the
            // run, and only stop once the content has settled for ~1.5s.
            endWaitRef.current += dt * 16.67;
            if (endWaitRef.current > 1500) {
              deactivate();
              return;
            }

          } else {
            endWaitRef.current = 0;
          }
        }
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
      return;
    }

    if (ifr) {

      // PDF iframe path. For our self-hosted /pdfjs viewer, the page includes
      // nb-bridge.js which listens for { type: "nb-autoscroll-tick", dy }
      // messages and scrolls #viewerContainer. We ping first to detect
      // support; if no pong arrives within 1.2s we toast and stop.
      let supported = false;
      const handler = (e: MessageEvent) => {
        // Only our own reader frame may drive the engine — otherwise any
        // embedded/opener window could stop autoscroll or fake a direction.
        if (!isTrustedBridgeMessage(e, ifr)) return;
        const d = e.data as { type?: string; dir?: unknown; atEnd?: unknown; page?: unknown };
        const cfgNow = dwellRef.current;
        const routeNow =
          cfgNow.enabled &&
          (cfgNow.parity === "route" || cfgNow.parity === "shuffle") &&
          cfgNow.route.length > 0;
        if (d.type === FromBridge.pong) {
          supported = true;
        } else if (d.type === FromBridge.dir) {
          // Route mode: the bridge owns direction per leg. Mirror it so the
          // parent keeps sending ticks with the right sign.
          const dir = Number(d.dir);
          if (dir === 1 || dir === -1) dirRef.current = dir;
        } else if (d.type === FromBridge.dwelling) {
          // The iframe engine parked on a page — same grading signal the
          // canvas loop records inline.
          noteShuffleVisit(Number(d.page));
        } else if (d.type === FromBridge.routeDone) {
          deactivate();
        } else if (d.type === FromBridge.state && d.atEnd && !routeNow) {
          deactivate();
        }



      };

      msgHandlerRef.current = handler;
      window.addEventListener("message", handler);

      postToBridge(ifr, { type: ToBridge.ping });
      // The ping resets bridge-side dwell state — re-send the current config.
      pushDwellToIframe(dwellRef.current);


      lastTsRef.current = 0;
      const tick = (ts: number) => {
        if (!lastTsRef.current) lastTsRef.current = ts;
        const dt = Math.min(4, (ts - lastTsRef.current) / 16.67);
        lastTsRef.current = ts;
        postToBridge(ifr, {
          type: ToBridge.tick,
          dy: speedRef.current * dt * dirRef.current,
        });
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      supportTimerRef.current = window.setTimeout(() => {
        if (!supported) {
          toast.info("Autoscroll sirf in-app PDFs pe chalta hai. Pehle My Library me save karo.");
          deactivate();
        }

      }, 1500);
    }
  }, [stop, deactivate, targetRef, iframeRef, pushDwellToIframe, noteShuffleVisit, closeShuffleVisit]);


  const toggle = useCallback(() => {
    // Side-effect free updater: compute from the ref so StrictMode's double
    // invocation can't start two rAF loops (old bug: double-speed scrolling).
    const next = !activeRef.current;
    activeRef.current = next;
    pausedRef.current = false;
    setActive(next);
    if (next) start(); else stop();
    if (docKey) safeSet(perDocActiveKey(docKey), next ? "1" : "0");
  }, [start, stop, docKey]);

  // Speed is read live from speedRef inside the loop, so no restart is needed.
  // Only restart when the engine is genuinely idle-but-active (e.g. after a
  // target swap) and never while the user is holding to pause.
  useEffect(() => {
    if (activeRef.current && !pausedRef.current && rafRef.current == null) start();
    /* eslint-disable-next-line */
  }, [speed]);

  useEffect(() => () => stop(), [stop]);

  // Rotation / window-resize resync.
  // The engine owns the scroll position as a float (`posRef`). After a device
  // rotation the reader re-lays out at a new page width, so the element's real
  // `scrollTop` no longer matches our float — the next frame would yank the
  // page back to the pre-rotation offset (or park it at the bottom and
  // auto-stop). Re-read the truth and keep the same relative position.
  useEffect(() => {
    const resync = () => {
      const el = resolveTarget();
      if (!el) return;
      const before = el.scrollHeight - el.clientHeight;
      const frac = before > 0 ? posRef.current / before : 0;
      // Two frames: one for the browser's own layout, one for the reader's
      // width recompute (ResizeObserver -> React state -> re-render).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = resolveTarget();
          if (!target) return;
          const after = target.scrollHeight - target.clientHeight;
          const next = after > 0 ? Math.min(after, Math.round(frac * after)) : 0;
          if (activeRef.current) target.scrollTop = next;
          posRef.current = activeRef.current ? next : target.scrollTop;
          lastTsRef.current = 0;
        });
      });
    };
    window.addEventListener("orientationchange", resync);
    window.addEventListener("resize", resync);
    return () => {
      window.removeEventListener("orientationchange", resync);
      window.removeEventListener("resize", resync);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  // Auto-resume from per-doc localStorage flag (Downloads / Local Storage PDFs).
  // Guarded by a 300ms grace so the target/iframe ref has time to attach.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!docKey || resumedRef.current) return;
    if (safeGet(perDocActiveKey(docKey)) !== "1") return;
    // Poll for up to 5s: the viewer/iframe ref can attach late (lazy chunk,
    // pdf.js boot). The old single 300ms shot silently gave up and the
    // remembered autoscroll never resumed.
    let tries = 0;
    const id = window.setInterval(() => {
      if (resumedRef.current || ++tries > 25) { window.clearInterval(id); return; }
      const ready = !!resolveTarget() || !!iframeRef?.current;
      if (!ready) return;
      window.clearInterval(id);
      resumedRef.current = true;
      activeRef.current = true;
      setActive(true);
      start();
    }, 200);
    return () => window.clearInterval(id);
  }, [docKey, targetRef, iframeRef, start]);


  // ── Hold-on-content pause ──────────────────────────────────────────────
  // When autoscroll is active, a press-and-hold anywhere on the scrolled
  // content temporarily pauses scrolling (engine stop, state stays `active`).
  // Release → engine resumes at the same speed automatically.
  // Threshold of 140ms avoids interfering with normal taps / swipes.
  useEffect(() => {
    if (!active) return;
    const el = targetRef?.current;
    if (!el) return; // iframe case is handled inside the iframe bridge

    let holdTimer: number | null = null;
    let paused = false;
    let startY = 0;
    let startX = 0;

    const clearTimer = () => {
      if (holdTimer != null) { window.clearTimeout(holdTimer); holdTimer = null; }
    };
    const onDown = (e: TouchEvent | PointerEvent) => {
      // Ignore presses that start on the FAB itself — it runs its own
      // hold-to-pause and the two handlers used to fight each other.
      const tgt = e.target as HTMLElement | null;
      if (tgt?.closest?.("[data-autoscroll-fab]")) return;
      const t = (e as TouchEvent).touches?.[0] ?? (e as PointerEvent);
      startX = t.clientX; startY = t.clientY;
      clearTimer();
      holdTimer = window.setTimeout(() => {
        paused = true;
        pausedRef.current = true;
        stop();
      }, 140);
    };
    const onMove = (e: TouchEvent | PointerEvent) => {
      if (paused) return;
      const t = (e as TouchEvent).touches?.[0] ?? (e as PointerEvent);
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > 10) clearTimer();
    };
    const onUp = () => {
      clearTimer();
      if (paused) {
        paused = false;
        pausedRef.current = false;
        // Resume only if still flagged active (user didn't toggle off).
        if (activeRef.current) start();
      }
    };


    el.addEventListener("touchstart", onDown, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onUp, { passive: true });
    el.addEventListener("touchcancel", onUp, { passive: true });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      clearTimer();
      el.removeEventListener("touchstart", onDown);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onUp);
      el.removeEventListener("touchcancel", onUp);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [active, targetRef, start, stop]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    recordReaderEvent("shuffle", { detail: "paused" });
    stop();
  }, [stop]);
  const resume = useCallback(() => {
    if (!activeRef.current) return;
    recordReaderEvent("shuffle", { detail: "resumed" });
    start();
  }, [start]);

  return {
    active,
    speed,
    setSpeed,
    toggle,
    pause,
    resume,
    reverse,
    setReverse,
    dwell,
    setDwell,
    scrollToTop,
  };
}
