import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePortalHost } from "../../hooks/usePortalHost";
import { useOverlayBackClose } from "../../hooks/useOverlayBackClose";
import { ChevronsDown, ChevronsUp, Settings2 } from "lucide-react";
import { tapHaptic, selectionHaptic } from "../../lib/native/haptics";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { MAX_SPEED } from "./autoScrollLimits";

/* The settings sheet (FSRS deck options, sliders, forecast) is a second-tap
   surface — loading it lazily keeps the reader's scroll FAB cheap. */
const AutoScrollSheet = lazyWithRetry(() => import("./AutoScrollSheet")) as typeof import("./AutoScrollSheet").default;

import { toast } from "sonner";
import { useAutoScroll } from "../../hooks/useAutoScroll";
import { MAX_LIST_LENGTH } from "../../lib/reader/dwellEngine";
import { FromBridge, isTrustedBridgeMessage } from "../../lib/reader/bridgeProtocol";
import { buildShuffleRoute, deckStats, forecastDue } from "../../lib/reader/fsrsScheduler";
import { loadShufflePrefs, saveShufflePrefs, type ShufflePrefs } from "../../lib/reader/shufflePrefs";
import { loadDeck, resetDeck } from "../../lib/reader/shuffleDeck";


interface Props {
  targetRef?: React.RefObject<HTMLElement | null>;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  /** Vertical offset above the bottom edge (px). Default 84 (above Save FAB). */
  bottomOffset?: number;
  /** Notified whenever autoscroll active state changes (so chrome can stay pinned). */
  onActiveChange?: (active: boolean) => void;
  /** Allows parent chrome to hide the FAB without clipping it inside page containers. */
  visible?: boolean;
  /** Stable per-document id — enables per-doc speed + auto-resume via localStorage. */
  docKey?: string;
}

/** Re-exported so existing importers keep one entry point for the clamp ceiling. */
export { MAX_SPEED };

/**
 * Floating autoscroll button.
 * - Tap → toggle on/off
 * - Long-press (≥280ms) → open speed picker (presets + fine slider, 0.01 step,
 *   floor 0.02x for ultra-slow reading)
 * - Gear button → same settings sheet with a single tap, also while running
 */
export default function AutoScrollFab({ targetRef, iframeRef, bottomOffset = 84, onActiveChange, visible = true, docKey }: Props): JSX.Element | null {
  const host = usePortalHost();
  const {
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
  } = useAutoScroll({ targetRef, iframeRef, docKey });
  const [open, setOpen] = useState(false);
  // Android hardware back must close the settings sheet instead of leaving the
  // reader (the sheet is a plain portal, not a Radix dialog, so it has no
  // built-in back handling).
  useOverlayBackClose(open, () => setOpen(false), "autoscroll-sheet");

  // ── Settings sheet a11y ────────────────────────────────────────────
  // The sheet is a hand-rolled modal (it must live in the fullscreen
  // portal host, so Radix Dialog isn't used). Give it dialog semantics,
  // Escape-to-close, initial focus and focus restore to the FAB.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const fabButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const opener = fabButtonRef.current;
    sheetRef.current?.focus();
    return () => opener?.focus?.();
  }, [open]);

  // Raw text the student typed for the "Custom" pause list. Kept local so
  // half-typed input ("1, 5, ") never gets destroyed by re-parsing.
  const [customText, setCustomText] = useState(() => (dwell?.pages ?? []).join(", "));
  const customSynced = useRef(false);
  useEffect(() => {
    // Sync once from persisted settings (per-doc load), then leave it to the user.
    if (customSynced.current) return;
    customSynced.current = true;
    if (dwell?.pages?.length) setCustomText(dwell.pages.join(", "));
  }, [dwell?.pages]);

  // Ordered route text ("6, 3, 8, 2") — order and repeats are meaningful here.
  const [routeText, setRouteText] = useState(() => (dwell?.route ?? []).join(", "));
  const routeSynced = useRef(false);
  useEffect(() => {
    if (routeSynced.current) return;
    routeSynced.current = true;
    if (dwell?.route?.length) setRouteText(dwell.route.join(", "));
  }, [dwell?.route]);


  // ── Shuffle (FSRS revision order) ──────────────────────────────────
  // The scheduler needs a page count. Same-origin readers expose one DOM node
  // per page; the pdf.js iframe reports `total` on every `nb-page-state`.
  const [bridgePages, setBridgePages] = useState(0);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!isTrustedBridgeMessage(e, iframeRef?.current)) return;
      const d = e.data as { type?: string; total?: unknown };
      if (d.type !== FromBridge.pageState) return;
      const total = Number(d.total);
      if (Number.isFinite(total) && total > 0) setBridgePages(total);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [iframeRef]);

  const resolvePageCount = (): number => {
    const root = targetRef?.current;
    // `[data-page]` is the reader's per-page wrapper and stays mounted for the
    // whole document (that's what the page pill counts). `.react-pdf__Page`
    // only exists for *rendered* pages, so on a virtualised document it would
    // shrink the deck to the visible window (30-page PDF → 11-page deck).
    const marked = root?.querySelectorAll<HTMLElement>("[data-page]") ?? [];
    let maxPage = 0;
    marked.forEach((node, i) => {
      const n = Number(node.dataset.page) || i + 1;
      if (n > maxPage) maxPage = n;
    });
    const dom = Math.max(maxPage, root?.querySelectorAll(".react-pdf__Page").length ?? 0);
    return Math.max(dom, bridgePages);
  };


  const [shuffleFromText, setShuffleFromText] = useState(() => String(dwell?.shuffleFrom || ""));
  const [shuffleToText, setShuffleToText] = useState(() => String(dwell?.shuffleTo || ""));
  const rangeSynced = useRef(false);
  useEffect(() => {
    if (rangeSynced.current) return;
    rangeSynced.current = true;
    if (dwell?.shuffleFrom) setShuffleFromText(String(dwell.shuffleFrom));
    if (dwell?.shuffleTo) setShuffleToText(String(dwell.shuffleTo));
  }, [dwell?.shuffleFrom, dwell?.shuffleTo]);

  const toBound = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  /** Anki-style deck options (retention, new/review mix, session cap). */
  const [prefs, setPrefsState] = useState<ShufflePrefs>(loadShufflePrefs);
  const setPrefs = (patch: Partial<ShufflePrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      saveShufflePrefs(next);
      return next;
    });
  };

  /** Rebuild the revision order from the saved deck. */
  const applyShuffle = (fromRaw = shuffleFromText, toRaw = shuffleToText, override?: Partial<ShufflePrefs>) => {
    const total = resolvePageCount();
    const from = toBound(fromRaw);
    const to = toBound(toRaw);
    if (!total) {
      toast.info("Pages abhi load ho rahe hain — ek second baad Shuffle dabao.");
      return;
    }
    const p = { ...prefs, ...override };
    const route = buildShuffleRoute(loadDeck(docKey), total, {
      from,
      to,
      seed: Date.now() & 0xffff,
      limit: MAX_LIST_LENGTH,
      retention: p.retention,
      newMix: p.newMix,
      sessionLimit: p.sessionLimit,
      leechThreshold: p.leechThreshold,
    });
    setDwell({ parity: "shuffle", route, shuffleFrom: from, shuffleTo: to, loopRoute: false });
  };

  const resetShuffle = () => {
    resetDeck(docKey);
    applyShuffle();
    toast.success("Revision memory reset — sab pages fir se naye.");
  };

  const shufflePageCount = resolvePageCount();
  const shuffleActive = dwell?.parity === "shuffle" && !!shufflePageCount;
  const shuffleRangeOpts = {
    from: toBound(shuffleFromText),
    to: toBound(shuffleToText),
    retention: prefs.retention,
    leechThreshold: prefs.leechThreshold,
  };
  const shuffleStats = shuffleActive
    ? deckStats(loadDeck(docKey), shufflePageCount, shuffleRangeOpts)
    : null;
  const shuffleForecast = shuffleActive
    ? forecastDue(loadDeck(docKey), shufflePageCount, 7, shuffleRangeOpts)
    : null;



  // While autoscroll is running, auto-hide the FAB after 2.5s of no user
  // activity so the pulsing arrow doesn't sit on top of the content the user
  // is trying to read. Any tap on the FAB or activity on the scrolled surface
  // brings it back for another 2.5s. See mem://features/autoscroll-fab.
  const [idleHidden, setIdleHidden] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const effectiveVisible = (visible || active || open) && !(active && idleHidden);
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);
  useEffect(() => { if (!effectiveVisible) setOpen(false); }, [effectiveVisible]);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const heldPause = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => { if (pressTimer.current) window.clearTimeout(pressTimer.current); }, []);

  // Auto-hide-while-active controller.
  const armHide = (delay = 2500) => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setIdleHidden(true), delay);
  };
  const kickShow = () => {
    setIdleHidden(false);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (active && !open) armHide();
  };

  // Start/stop the auto-hide timer with the active state and speed-picker.
  useEffect(() => {
    if (!active || open) {
      setIdleHidden(false);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      return;
    }
    armHide();
    return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, [active, open, speed]);

  // Listen for user activity on the scrolled surface (native el + pdf iframe)
  // to reveal the FAB again while autoscroll keeps running.
  useEffect(() => {
    if (!active) return;
    const el = targetRef?.current ?? null;
    const onActivity = () => kickShow();
    el?.addEventListener("pointerdown", onActivity, { passive: true });
    el?.addEventListener("touchstart", onActivity, { passive: true });
    // Window-level fallback so downloaded-PDF (iframe) taps and page-scroll
    // taps also un-hide the FAB even when the ref points to <html>.
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("wheel", onActivity, { passive: true });
    const onMsg = (e: MessageEvent) => {
      const d = e?.data;
      if (d && typeof d === "object" && d.type === "nb-autoscroll-user-activity") kickShow();
    };
    window.addEventListener("message", onMsg);
    return () => {
      el?.removeEventListener("pointerdown", onActivity);
      el?.removeEventListener("touchstart", onActivity);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("wheel", onActivity);
      window.removeEventListener("message", onMsg);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetRef?.current]);

  // The page pill's drag-to-scrub writes scrollTop every frame; pause the
  // autoscroll loop for the duration of the drag so they don't fight.
  const scrubPaused = useRef(false);
  useEffect(() => {
    const onStart = () => {
      if (!active || scrubPaused.current) return;
      scrubPaused.current = true;
      pause();
    };
    const onEnd = () => {
      if (!scrubPaused.current) return;
      scrubPaused.current = false;
      resume();
    };
    window.addEventListener("nb-reader-scrub-start", onStart);
    window.addEventListener("nb-reader-scrub-end", onEnd);
    return () => {
      window.removeEventListener("nb-reader-scrub-start", onStart);
      window.removeEventListener("nb-reader-scrub-end", onEnd);
      // Never leave the loop paused if the reader unmounts mid-drag.
      if (scrubPaused.current) {
        scrubPaused.current = false;
        resume();
      }
    };
  }, [active, pause, resume]);


  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    longPressed.current = false;
    heldPause.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (active) {
      // Hold-to-pause: after a tiny threshold, pause the scroll without
      // changing `active`. Release will resume at the same speed.
      pressTimer.current = window.setTimeout(() => {
        heldPause.current = true;
        pause();
      }, 140);
    } else {
      // Idle → long-press opens speed picker.
      pressTimer.current = window.setTimeout(() => {
        longPressed.current = true;
        // Same selection haptic the page pill uses when it grabs the finger.
        void selectionHaptic();
        setOpen(true);
      }, 280);

    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    // Cancel long-press only on a deliberate drag (>12px), not tiny jitter.
    if (!startPos.current || longPressed.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (Math.hypot(dx, dy) > 12 && pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (heldPause.current) {
      // Was paused while held → resume at same speed, don't toggle off.
      resume();
    } else if (!longPressed.current) {
      void tapHaptic("light");
      toggle();

    }
    heldPause.current = false;
    startPos.current = null;
  };
  // A touch that turns into a scroll/gesture fires pointercancel instead of
  // pointerup — without this the hold-timer stayed armed and the FAB got stuck
  // in "paused" state, which read as "nothing works".
  const onPointerCancel = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    if (heldPause.current) resume();
    heldPause.current = false;
    longPressed.current = false;
    startPos.current = null;
  };

  const fab = (
    <>
      <button
        data-testid="autoscroll-fab"
        ref={fabButtonRef}
        type="button"

        aria-label={active ? "Stop autoscroll" : reverse ? "Start reverse autoscroll" : "Start autoscroll"}
        aria-pressed={active}
        onPointerDown={onPointerDown}

        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        data-autoscroll-fab="true"
        className={`fixed right-4 sm:right-5 z-[68] flex h-12 w-12 select-none items-center justify-center rounded-full shadow-lg ring-1 ring-black/10 transition-all duration-200 active:scale-95 ${
          effectiveVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        } ${
          active
            ? "bg-primary text-primary-foreground ring-2 ring-primary"
            : "bg-card text-foreground"
        }`}
        style={{
          bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`,
          touchAction: "none",
          WebkitTouchCallout: "none",
        }}
      >
        {reverse ? (
          <ChevronsUp className="h-6 w-6" aria-hidden="true" />
        ) : (
          <ChevronsDown className="h-6 w-6" aria-hidden="true" />
        )}
      </button>

      {/* Explicit settings button. The long-press gesture alone was
          undiscoverable and unreliable on touch (context menu / scroll steals
          it), so the sheet now always has a plain one-tap opener that also
          works while autoscroll is running. */}
      <button
        data-testid="autoscroll-settings"
        type="button"
        aria-label="Autoscroll settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          void selectionHaptic();
          setOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        className={`fixed right-4 sm:right-5 z-[68] flex h-9 w-9 select-none items-center justify-center rounded-full bg-card text-foreground shadow-lg ring-1 ring-black/10 transition-all duration-200 active:scale-95 ${
          effectiveVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ bottom: `calc(${bottomOffset + 56}px + env(safe-area-inset-bottom, 0px))` }}
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <Suspense fallback={null}>
        <AutoScrollSheet
          onClose={() => setOpen(false)}
          speed={speed}
          setSpeed={setSpeed}
          reverse={reverse}
          setReverse={setReverse}
          dwell={dwell}
          setDwell={setDwell}
          scrollToTop={scrollToTop}
          customText={customText}
          setCustomText={setCustomText}
          routeText={routeText}
          setRouteText={setRouteText}
          shuffleFromText={shuffleFromText}
          setShuffleFromText={setShuffleFromText}
          shuffleToText={shuffleToText}
          setShuffleToText={setShuffleToText}
          applyShuffle={applyShuffle}
          resetShuffle={resetShuffle}
          shuffleStats={shuffleStats}
          shuffleForecast={shuffleForecast}
          shufflePrefs={prefs}
          setShufflePrefs={setPrefs}
          pageCount={shufflePageCount}
          sheetRef={sheetRef}

        />
        </Suspense>
      )}
    </>
  );

  if (typeof document === "undefined") return fab;
  return createPortal(fab, host ?? document.body) as unknown as JSX.Element;
}
