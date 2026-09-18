import { useState, useCallback, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { 
  Play, Pause, VolumeX,
  Bookmark as BookmarkIcon
} from "lucide-react";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import EndScreenOverlay from "./EndScreenOverlay";
import SeekBar from "./SeekBar";
import birdLogo from "../../assets/branding/jsr-mark.webp";
const nbBirdLogo = birdLogo;
import { useOrientation } from "../../hooks/useOrientation";
import RotatePhoneIcon from "../icons/RotatePhoneIcon";
import { PlayerTopOverlay } from "./PlayerTopOverlay";
import { PlayerBrandMasks } from "./PlayerBrandMasks";
import { PlayerCenterControls } from "./PlayerCenterControls";
import { PlayerSettingsMenu } from "./PlayerSettingsMenu";

import { cn } from "../../lib/utils";
import { extractYoutubeId } from "../../lib/videoUtils";
import { formatTime as formatPlayerTime, isLiveStreamUrl, buildYoutubeEmbedUrl, pointerRatio, percentOf } from "./lib/playerGeometry";
import { safeGet, safeSet } from "../../lib/storage";
import { lockOrientation, unlockOrientation, isNativeOrientationAvailable } from "../../lib/screenOrientation";
import { enterImmersive, exitImmersive } from "../../lib/androidImmersive";
import { tapProbe } from "../../lib/perf/tapProbe";
import { tapHaptic } from "../../lib/native/haptics";
import { useAutoHideControls, IDLE_HIDE_MS_AFTER_SEEK } from "./hooks/useAutoHideControls";
import { useVideoStatusBarHide } from "../../hooks/useVideoStatusBarHide";
import { useLessonMarkers } from "../../hooks/useLessonMarkers";
import { useLessonBookmarks, type Bookmark } from "../../hooks/useLessonBookmarks";
import BookmarkNoteDialog from "./BookmarkNoteDialog";
import { DoubleTapRipple, SwipeIndicatorPill, LongPressSpeedBadge } from "./PlayerOverlays";
import { usePlayerReaderControls } from "../../hooks/usePlayerReaderControls";
import { toast } from "sonner";


// DEV-only logger. A 2-hour viewing session can fire thousands of player
// lifecycle warns (tap-toggle / immersive-sync / fullscreen-flip). In
// production, Sentry's `CaptureConsole` forwards every warn to the backend —
// huge noise + cost. Wrap the chatty per-event traces here so they stay in
// the developer console but never reach Sentry / Logcat in release builds.
const playerLog: typeof console.warn = import.meta.env.DEV
  ? console.warn.bind(console)
  : () => {};




interface MahimaGhostPlayerProps {
  videoUrl?: string;
  videoId?: string;
  title?: string;
  subtitle?: string;
  lessonId?: string;
  onEnded?: () => void;
  onReady?: () => void;
  onDurationReady?: (duration: number) => void;
  nextVideoUrl?: string;
  nextVideoTitle?: string;
  onNextVideo?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

const MahimaGhostPlayer = memo(({
  videoUrl,
  videoId,
  title,
  subtitle,
  lessonId,
  onEnded,
  onReady,
  onDurationReady,
  nextVideoUrl,
  nextVideoTitle,
  onNextVideo,
  onTimeUpdate,
}: MahimaGhostPlayerProps) => {
  // Player state
  const isPortrait = useOrientation();
  const { infinityLogo: showInfinityLogo, youtubeMask: showYoutubeMask } = usePlayerReaderControls();
  const [isLoaded, setIsLoaded] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(() => {
    const saved = safeGet('nb_player_volume');
    return saved ? parseFloat(saved) : 80;
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [showEndScreen, setShowEndScreen] = useState(false);
  const [isFakeFullscreen, setIsFakeFullscreen] = useState(false);
  // showControls is provided by useAutoHideControls below (declared after isInLastTenSeconds is computed).
  const [isBuffering, setIsBuffering] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [watermarkForceVisible, setWatermarkForceVisible] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Swipe gesture state (MX Player-style)
  const [brightness, setBrightness] = useState(() => {
    const saved = safeGet('nb_player_brightness');
    const n = saved ? parseFloat(saved) : 100;
    return Number.isFinite(n) ? Math.max(20, Math.min(100, n)) : 100;
  });
  const [swipeIndicator, setSwipeIndicator] = useState<{
    type: 'brightness' | 'volume';
    value: number;
    visible: boolean;
  } | null>(null);
  const swipeTouchRef = useRef<{
    startY: number; startX: number; startVal: number;
    side: 'left' | 'right'; locked: boolean;
    mode: 'value' | 'seek' | null; startTime: number;
  } | null>(null);
  const swipeIndicatorTimer = useRef<ReturnType<typeof setTimeout>>();
  // Audit M-1: rAF gate for live swipe-seek postMessage. Without this,
  // holding a horizontal swipe fires 30-60 `sendCommand("seekTo")` per
  // second — the YouTube bridge queues them all and replays a burst on
  // release, causing a visible jump on mid-range Android.
  const swipeSeekRafRef = useRef<number | null>(null);
  const swipeSeekTargetRef = useRef<number>(0);

  // Double-tap state
  const [doubleTapRipple, setDoubleTapRipple] = useState<{ side: 'left' | 'right'; key: number } | null>(null);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right'; zone: 'edge' | 'center' } | null>(null);
  const touchStartedOnControlRef = useRef(false);

  // Long-press 2x speed state
  const [isLongPressSpeed, setIsLongPressSpeed] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const longPressSpeedBeforeRef = useRef<number>(1); // speed before long-press

  // Rotation state — supports 0, 90, 180, 270 degrees
  const [rotation, setRotation] = useState(0);

  // Premium seek bar: lesson markers + per-user bookmarks
  const { chapters, quizMarkers } = useLessonMarkers(lessonId);
  const { bookmarks, addAndReturn: addBookmarkAndReturn, update: updateBookmark, remove: removeBookmark } = useLessonBookmarks(lessonId);
  const [activeBookmark, setActiveBookmark] = useState<Bookmark | null>(null);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);


  // Native-first rotation: on Capacitor we ask the OS to physically rotate the
  // device (no CSS transform on the YouTube iframe → no freeze/lag). On web we
  // fall back to the legacy CSS-rotation pseudo-fullscreen.
  const useNativeRotation = isNativeOrientationAvailable();

  // SYNCHRONOUS fullscreen toggle — critical for Android WebView. Any `await`
  // before native API calls (requestFullscreen / orientation lock) breaks the
  // user-gesture context → silent reject → iframe re-renders mid-flight →
  // YouTube postMessage bridge drops → black freeze. So: state + DOM class +
  // native API are all fired in the same tick; async work is .catch()'d.
  const applyFullscreen = useCallback((wantFs: boolean) => {
    setIsFakeFullscreen(wantFs);
    // class-based scroll lock — never leaks because central cleanup effect
    // below removes it on every exit signal (popstate, visibility, unmount).
    if (wantFs) document.body.classList.add("nb-scroll-lock");
    else document.body.classList.remove("nb-scroll-lock");

    if (wantFs) {
      try { window.history.pushState({ playerFullscreen: true }, ""); } catch {}
      if (useNativeRotation) {
        // Native OS rotation only — skip documentElement.requestFullscreen()
        // (WebView rejects it on <div>/<html>, no value, only failure window).
        lockOrientation("landscape").catch(() => {});
      } else {
        // Web: best-effort real fullscreen, never awaited.
        try {
          const el = document.documentElement;
          const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
          req?.call(el)?.catch?.(() => {});
        } catch { /* pseudo-fullscreen fallback active */ }
      }
    } else {
      // Pop the playerFullscreen sentinel pushed on entry. Otherwise the
      // next hardware back press hits useAndroidBackButton step-1 and is
      // silently swallowed — user thinks back is broken inside the lesson.
      try {
        if (window.history.state?.playerFullscreen) window.history.back();
      } catch { /* noop */ }
      if (useNativeRotation) {
        unlockOrientation().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    }
  }, [useNativeRotation]);

  const rotateCW = useCallback(() => {
    if (useNativeRotation) {
      // Toggle: enter fullscreen + native landscape, or exit both.
      applyFullscreen(!isFakeFullscreen);
      setRotation(0);
      return;
    }
    const next = rotation === 0 ? 90 : 0;
    setRotation(next);
    applyFullscreen(next !== 0);
  }, [rotation, applyFullscreen, isFakeFullscreen, useNativeRotation]);

  const rotateCCW = useCallback(() => {
    if (useNativeRotation) { rotateCW(); return; }
    const next = (rotation - 90 + 360) % 360;
    setRotation(next);
    applyFullscreen(next !== 0);
  }, [rotation, applyFullscreen, useNativeRotation, rotateCW]);

  // Reconcile with real fullscreen state + bulletproof scroll-lock cleanup.
  // Listens to every signal that can end fullscreen externally so the page
  // never gets stuck with body locked / orientation locked.
  useEffect(() => {
    const release = () => {
      setIsFakeFullscreen(false);
      setRotation(0);
      document.body.classList.remove("nb-scroll-lock");
      if (useNativeRotation) unlockOrientation().catch(() => {});
      // Same sentinel-leak fix as applyFullscreen(false). External signals
      // (fullscreenchange, visibilitychange, pagehide) take us out of
      // fullscreen without going through applyFullscreen, so the sentinel
      // must be popped here too.
      try {
        if (window.history.state?.playerFullscreen) window.history.back();
      } catch { /* noop */ }
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) release();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") release();
    };
    // CRITICAL: on the native-rotation path we never enter real
    // `document.fullscreenElement`, so `fullscreenchange` cannot rescue
    // us when the Android hardware back button pops the
    // `playerFullscreen` sentinel via `history.back()` (see
    // useAndroidBackButton step-1). Without this listener the player
    // stays locked in landscape fake-fullscreen and the NEXT back press
    // exits the whole LessonView — user perceives a single back = exit.
    const onPopState = () => {
      if (!window.history.state?.playerFullscreen) release();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("popstate", onPopState);
      // Safety: never leave the page locked.
      document.body.classList.remove("nb-scroll-lock");
    };
  }, [useNativeRotation]);



  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLIFrameElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const progressIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Publish the rendered player height as a CSS var on <html> so the inline
  // PDF (and any other below-player content) can size itself responsively
  // across phones, tablets, foldables, and rotation states — no hard-coded
  // 16:9 assumption. Updates on resize, orientation change, and fullscreen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const publish = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) document.documentElement.style.setProperty("--nb-player-h", `${Math.round(h)}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("orientationchange", publish);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", publish);
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty("--nb-player-h");
    };
  }, []);

  // YouTube ID extraction — deduped to `videoUtils.extractYoutubeId`
  // (audit L-3). Previously three inline copies existed with diverging
  // regexes (e.g., only videoUtils handled `/shorts/`).
  const youtubeId = videoId || extractYoutubeId(videoUrl);

  // YouTube IFrame API Commands
  const sendCommand = useCallback((func: string, args: string | number | Array<string | number> = "") => {
    if (playerRef.current?.contentWindow) {
      try {
        const message = JSON.stringify({
          event: "command",
          func,
          args: args === "" ? "" : Array.isArray(args) ? args : [args],
        });
        // CRITICAL: iframe is youtube-nocookie.com (line 786). targetOrigin
        // MUST match the iframe's actual origin or the browser silently drops
        // the message — that was the root cause of: play/pause/seek/setVolume
        // not working AND timestamp/progress bar never updating (because
        // "listening" + getCurrentTime were also dropped).
        playerRef.current.contentWindow.postMessage(message, "https://www.youtube-nocookie.com");
      } catch (e) {
        console.warn("sendCommand failed:", func, e);
      }
    }
  }, []);

  const playVideo = useCallback(() => {
    if (!playerReady) return;
    sendCommand("playVideo");
    if (isMuted) {
      sendCommand("unMute");
      sendCommand("setVolume", volume);
      setIsMuted(false);
    }
    setIsPlaying(true);
  }, [sendCommand, playerReady, isMuted, volume]);

  const pauseVideo = useCallback(() => {
    if (!playerReady) return;
    sendCommand("pauseVideo");
    setIsPlaying(false);
  }, [sendCommand, playerReady]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pauseVideo();
    else playVideo();
  }, [isPlaying, playVideo, pauseVideo]);

  const seekTo = useCallback((seconds: number, allowSeekAhead: boolean = true) => {
    if (!playerReady) return;
    const clampedTime = Math.max(0, Math.min(seconds, duration || 9999));
    sendCommand("seekTo", [clampedTime, allowSeekAhead]);
    setCurrentTime(clampedTime);
  }, [sendCommand, duration, playerReady]);

  // Listen for external "jump to bookmark" requests from the BookmarksPanel
  // rendered below the player. Decoupled via a window event so the panel
  // doesn't need a ref into the iframe-backed player.
  useEffect(() => {
    const onSeek = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === "number" && Number.isFinite(detail)) {
        seekTo(detail, true);
      }
    };
    window.addEventListener("nb:lesson-seek", onSeek as EventListener);
    return () => window.removeEventListener("nb:lesson-seek", onSeek as EventListener);
  }, [seekTo]);

  const skipForward = useCallback(() => {
    if (!playerReady) return;
    const newTime = Math.min(currentTime + 10, duration || 9999);
    seekTo(newTime);
  }, [currentTime, duration, seekTo, playerReady]);

  const skipBackward = useCallback(() => {
    if (!playerReady) return;
    const newTime = Math.max(0, currentTime - 10);
    seekTo(newTime);
  }, [currentTime, seekTo, playerReady]);

  const setPlayerVolume = useCallback((vol: number) => {
    const v = Math.max(0, Math.min(100, vol));
    sendCommand("setVolume", v);
    setVolume(v);
    safeSet('nb_player_volume', v.toString());
    if (v === 0) setIsMuted(true);
    else if (isMuted) { sendCommand("unMute"); setIsMuted(false); }
  }, [sendCommand, isMuted]);

  // Real device brightness on native (web fallback = dim overlay).
  const applyBrightness = useCallback((val: number) => {
    const v = Math.max(20, Math.min(100, val));
    setBrightness(v);
    safeSet('nb_player_brightness', v.toString());
    // Native brightness plugin (@capgo/capacitor-screen-brightness) is NOT
    // bundled in this build — overlay-only fallback. Skipping the dynamic
    // import entirely avoids module-resolution console noise on every drag.
    /* overlay-only brightness */
  }, []);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      sendCommand("unMute");
      sendCommand("setVolume", volume || 80);
      setIsMuted(false);
    } else {
      sendCommand("mute");
      setIsMuted(true);
    }
  }, [isMuted, volume, sendCommand]);

  const toggleFullscreen = useCallback(() => {
    const wantFs = !isFakeFullscreen;
    if (!wantFs) setRotation(0);
    applyFullscreen(wantFs);
  }, [isFakeFullscreen, applyFullscreen]);


  const preventAll = useCallback((e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }, []);

  const setSpeed = useCallback((speed: number) => {
    sendCommand("setPlaybackRate", speed);
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  }, [sendCommand]);

  // Derived watermark visibility: hidden first 10s, always visible last 10s or end screen
  const isInLastTenSeconds = duration > 0 && (duration - currentTime) <= 10;
  const watermarkVisible = currentTime >= 10 || showEndScreen || isInLastTenSeconds;

  // Centralised auto-hide controls (single source of truth).
  // Locked = menu open, seek drag, last 10s, end screen, not yet playable.
  const {
    visible: showControls,
    setVisible: setShowControls,
    kick: showControlsNow,
    toggle: toggleControls,
  } = useAutoHideControls({
    isPlaying,
    isLocked:
      showVolumeSlider ||
      showSpeedMenu ||
      isSeeking ||
      isInLastTenSeconds ||
      showEndScreen ||
      !playerReady ||
      isBuffering,
    delay: 3000,
  });

  // Sync Android nav-bar (immersive mode) with player chrome visibility while
  // in fullscreen. When user taps to reveal player controls we ALSO reveal the
  // system nav bar so the back button is reachable without an edge swipe; when
  // chrome auto-hides we restore immersive for distraction-free playback.
  // Outside fullscreen, the global auto-toggle (installImmersiveAutoToggle) owns state.
  // Guard against redundant bridge calls — re-issuing the same immersive
  // state on every render (or every showSpeedMenu toggle) made the Android
  // system nav bar VISIBLY BLINK in landscape because each call triggers a
  // setSystemUiVisibility transition. We now:
  //   1. Only depend on (isFakeFullscreen, showControls) — menu state is
  //      irrelevant to immersive sync.
  //   2. Skip the call when the desired state hasn't actually changed.
  //   3. Fire ONCE per change (no rAF double-tap) — the double-fire was the
  //      root cause of the "blink" the user reported.
  const lastImmersiveRef = useRef<"show" | "hide" | null>(null);
  useEffect(() => {
    if (!isFakeFullscreen) {
      // Leaving fullscreen → restore system bars exactly once.
      if (lastImmersiveRef.current !== "show") {
        lastImmersiveRef.current = "show";
        exitImmersive();
      }
      return;
    }
    // Master-skill Golden Rule: in fullscreen, system nav bar visibility
    // MUST equal player chrome visibility. One tap → both appear; another
    // tap → both hide. The lastImmersiveRef guard prevents the historical
    // "blink" (double-fire on unrelated re-renders); a single state change
    // triggers exactly one bridge call.
    const desired: "show" | "hide" = showControls ? "show" : "hide";
    if (lastImmersiveRef.current === desired) return;
    lastImmersiveRef.current = desired;
    playerLog("[player] immersive-sync", { desired, fs: true });
    if (desired === "show") {
      exitImmersive();
    } else {
      enterImmersive();
      tapProbe.mark("immersive");
    }
  }, [isFakeFullscreen, showControls]);

  // YouTube-style status-bar hide during playback. After 3s of continuous
  // play, the Android status bar disappears (and immersive mode kicks in,
  // covering the nav bar too). Pause / end / unmount restore it.
  // Fixes landscape-APK bug where the status strip stayed pinned over the
  // video because immersive was gated on `isFakeFullscreen` alone.
  useVideoStatusBarHide({ isPlaying, delayMs: 3000 });

  // Logcat: fullscreen enter/exit transitions for correlating with safe-area.
  useEffect(() => {
    playerLog("[player] fullscreen", { isFakeFullscreen, rotation, isPlaying });
  }, [isFakeFullscreen, rotation, isPlaying]);

  // Wrap toggle with a light haptic + log for "soft touch" tactile feedback
  // on Android. No-op on web (haptics module guards Capacitor.isNativePlatform).
  // Read showControls via ref so this callback identity stays stable across
  // visibility flips (was re-creating on every show/hide → wasted re-renders
  // of every child that received it via prop / memo dep).
  const showControlsRef = useRef(showControls);
  useEffect(() => {
    showControlsRef.current = showControls;
    tapProbe.mark("commit");
  }, [showControls]);
  const toggleControlsSoft = useCallback(() => {
    void tapHaptic("light");
    playerLog("[player] tap-toggle", { from: showControlsRef.current });
    tapProbe.mark("toggle");
    // Stamp so any synthetic mouse-click that fires after this touch-driven
    // toggle (on top overlay z-55 or bottom bar z-50, which become
    // pointer-events-auto the moment showControls flips) is deduped by
    // the shared 350ms guard. Prevents fullscreen "tap does nothing"
    // where tap→show→synthetic-click→hide happened in <300ms.
    lastTouchToggleAtRef.current = Date.now();
    toggleControls();
  }, [toggleControls]);

  const handleTopOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (Date.now() - lastTouchToggleAtRef.current < 350) return;
    toggleControlsSoft();
  }, [toggleControlsSoft]);


  // Stamped on every touch interaction. Touch screens fire SYNTHETIC mouse
  // events (mousemove/mouseup/click) ~0–700ms AFTER touchend. Without this
  // guard, a tap-to-HIDE would immediately be undone by the synthetic
  // mousemove calling showControlsNow() → chrome reappears and hide "does
  // nothing". Show worked (mousemove re-show is a no-op) but hide never stuck.
  const lastTouchAtRef = useRef(0);
  const isRecentTouch = () => Date.now() - lastTouchAtRef.current < 700;

  // Mouse move on desktop: show controls + reset timer.
  // Ignore synthetic mouse events that follow a touch (see lastTouchAtRef).
  const handleMouseMove = useCallback(() => {
    if (isRecentTouch()) return;
    showControlsNow();
  }, [showControlsNow]);



  // Tap-to-toggle is deferred to touchEnd (see overlay handlers) to avoid the
  // flicker that happened when controls toggled on every raw touchStart
  // (swipes / double-taps / long-press all flashed the controls).
  const suppressTapToggleRef = useRef(false);
  const handleOverlayTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.stopPropagation();
    },
    []
  );

  // Click: on desktop toggle. On touch devices touchstart already handled
  // it — guard via a recent-touch timestamp so DevTools mobile-emulation
  // (which fires click but not always touchstart) still toggles, while
  // real devices don't double-toggle from the synthetic click.
  const lastTouchToggleAtRef = useRef(0);
  const handleOverlayTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      // Only the empty video surface toggles chrome. If the tap landed on any
      // child control (back button, play, seek bar, menu, speed picker, …),
      // ignore — let that control handle its own click without double-firing.
      if (e.target !== e.currentTarget) return;
      // Synthetic click fires ~50–300ms after touchstart on mobile WebKit/Blink.
      // 350ms is enough to dedupe the synthetic click while still letting a
      // genuine desktop double-click (≥300ms gap) re-toggle without lag.
      if (Date.now() - lastTouchToggleAtRef.current < 350) return;
      toggleControlsSoft();
    },
    [toggleControlsSoft]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'arrowleft': case 'j': e.preventDefault(); skipBackward(); break;
        case 'arrowright': case 'l': e.preventDefault(); skipForward(); break;
        case 'arrowup': e.preventDefault(); setPlayerVolume(Math.min(100, volume + 5)); break;
        case 'arrowdown': e.preventDefault(); setPlayerVolume(Math.max(0, volume - 5)); break;
        case 'm': e.preventDefault(); toggleMute(); break;
        case 'f': e.preventDefault(); toggleFullscreen(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipForward, skipBackward, toggleMute, toggleFullscreen, setPlayerVolume, volume]);

  // Back-button intercept: when rotated, first step resets rotation to 0° instead of navigating away.
  // The pushState sentinel MUST be popped on cleanup, otherwise a stale forward-history entry
  // survives after the player closes and silently swallows the user's next back press.
  useEffect(() => {
    if (rotation === 0) return;
    window.history.pushState({ rotationGuard: true }, '');
    const handlePopState = () => {
      if (rotation !== 0) {
        setRotation(0);
        setIsFakeFullscreen(false);
        document.body.classList.remove('nb-scroll-lock');
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Pop our sentinel if it's still on top of the history stack.
      // Guarded by the state shape so we never eat a legitimate route entry.
      if (typeof window !== 'undefined' && window.history.state?.rotationGuard === true) {
        window.history.back();
      }
    };
  }, [rotation]);


  // Restore body scroll on unmount (in case component unmounts while rotated)
  useEffect(() => {
    return () => {
      document.body.classList.remove('nb-scroll-lock');
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      if (useNativeRotation) { unlockOrientation().catch(() => {}); }
    };
  }, [useNativeRotation]);

  // Anti-piracy + fullscreen listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controlsTimeout = controlsTimeoutRef.current;
    const progressInterval = progressIntervalRef.current;
    container.addEventListener('contextmenu', preventAll, { capture: true });
    container.addEventListener('copy', preventAll, { capture: true });
    container.addEventListener('cut', preventAll, { capture: true });
    container.addEventListener('dragstart', preventAll, { capture: true });
    const blockLinks = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.closest('a')) { e.preventDefault(); e.stopPropagation(); }
    };
    container.addEventListener('click', blockLinks, { capture: true });
    return () => {
      container.removeEventListener('contextmenu', preventAll);
      container.removeEventListener('copy', preventAll);
      container.removeEventListener('cut', preventAll);
      container.removeEventListener('dragstart', preventAll);
      container.removeEventListener('click', blockLinks);
      if (controlsTimeout) clearTimeout(controlsTimeout);
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [preventAll]);

  // YouTube API message listener
  const readyFallbackRef = useRef<ReturnType<typeof setTimeout>>();

  // Unmount hardening (audit C-2, C-3, M-4):
  //  • Blank the YouTube iframe → releases ~50–80 MB of decoded frames on
  //    2 GB Android; parity with BunnyStreamPlayer.
  //  • Clear the 300ms `onReady` fallback so it can't fire after teardown
  //    and call `sendCommand` on a null contentWindow.
  //  • Clear gesture timers (double-tap, long-press, swipe indicator) so
  //    they can't setState on an unmounted component.
  //  • Drop any lingering `playerFullscreen` history sentinel.
  useEffect(() => {
    const player = playerRef.current;
    return () => {
      try { if (player) player.src = "about:blank"; } catch {}
      if (readyFallbackRef.current) clearTimeout(readyFallbackRef.current);
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (swipeIndicatorTimer.current) clearTimeout(swipeIndicatorTimer.current);
      if (swipeSeekRafRef.current != null) cancelAnimationFrame(swipeSeekRafRef.current);
      try {
        if (window.history.state?.playerFullscreen) {
          window.history.replaceState(null, "");
        }
      } catch {}
    };
  }, []);

  // Refs mirror state read inside the message handler so we DON'T re-register
  // the `window.addEventListener('message', ...)` on every volume drag, every
  // seek tick, or every duration update. Previously the effect dep-array
  // included `volume`, `isSeeking`, `duration` → the listener was torn down
  // and re-added at ~250ms (the infoDelivery cadence) causing dropped
  // YouTube events mid-playback and double `onEnded` firing via a stale
  // `showEndScreen` capture. (Audit findings #1, #2, #5.)
  const volumeRef = useRef(volume);
  const showEndScreenRef = useRef(showEndScreen);
  const isSeekingRef = useRef(isSeeking);
  const durationRef = useRef(duration);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { showEndScreenRef.current = showEndScreen; }, [showEndScreen]);
  useEffect(() => { isSeekingRef.current = isSeeking; }, [isSeeking]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Exact-origin allow-list (audit SEC finding) — previous `.includes('youtube')`
      // would let `https://evil-youtube.example` through.
      if (
        event.origin !== 'https://www.youtube-nocookie.com' &&
        event.origin !== 'https://www.youtube.com'
      ) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        // YouTube signals the player is ready — cancel fallback timer and enable immediately
        if (data.event === 'onReady') {
          if (readyFallbackRef.current) clearTimeout(readyFallbackRef.current);
          setPlayerReady(true);
          sendCommand("pauseVideo");
          sendCommand("seekTo", [0, true]);
          sendCommand("setVolume", volumeRef.current);
          setIsPlaying(false);
          onReady?.();
        }

        if (data.event === 'onStateChange') {
          switch (data.info) {
            case -1: setIsBuffering(false); break;
            case 0:
              setIsPlaying(false);
              // Delay stop/seek slightly to avoid iframe glitch on end
              setTimeout(() => {
                sendCommand("stopVideo");
                sendCommand("seekTo", [0, false]);
              }, 100);
              if (!showEndScreenRef.current) {
                setShowEndScreen(true);
                setWatermarkForceVisible(true);
                onEnded?.();
              }
              break;
            case 1: setIsPlaying(true); setIsBuffering(false); break;
            case 2: setIsPlaying(false); setIsBuffering(false); break;
            case 3: setIsBuffering(true); break;
          }
        }
        // Fallback end guard + progress updates (merged into a single
        // infoDelivery branch — audit H-1: two consecutive if-blocks caused
        // `onEnded` to fire twice because `showEndScreenRef` update lagged
        // one React cycle behind the first block's setState).
        if (data.event === 'infoDelivery') {
          const ct = data.info?.currentTime;
          const dur = data.info?.duration;
          if (ct !== undefined && dur && dur > 0 && (dur - ct) <= 2 && (dur - ct) > 0 && !showEndScreenRef.current) {
            // Flip the ref synchronously so the second guard below (or a
            // rapid second infoDelivery tick) can't re-enter.
            showEndScreenRef.current = true;
            sendCommand("pauseVideo");
            setTimeout(() => {
              sendCommand("stopVideo");
              sendCommand("seekTo", [0, false]);
            }, 100);
            setIsPlaying(false);
            setShowEndScreen(true);
            setWatermarkForceVisible(true);
            onEnded?.();
          }
          if (dur && dur > 0) {
            setDuration(dur);
            onDurationReady?.(dur);
          }
          if (ct !== undefined && !isSeekingRef.current) {
            setCurrentTime(ct);
            onTimeUpdate?.(ct, dur || durationRef.current);
          }
          if (data.info?.videoLoadedFraction !== undefined) setBufferedTime(data.info.videoLoadedFraction * (dur || durationRef.current));
        }
      } catch {}
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // Deps intentionally minimal: only callbacks + sendCommand. State reads
    // go through refs above so the listener registers ONCE per mount.
  }, [onEnded, onDurationReady, onTimeUpdate, sendCommand, onReady]);

  // Poll YouTube for real-time progress updates
  useEffect(() => {
    if (!playerReady) return;
    // Subscribe to infoDelivery events (fires every ~250ms while playing)
    const subscribe = () => {
      if (playerRef.current?.contentWindow) {
        try {
          playerRef.current.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1 }), "https://www.youtube-nocookie.com");
          // Also request current time explicitly so the bar updates even when paused
          playerRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: "getCurrentTime", args: "" }), "https://www.youtube-nocookie.com");
        } catch {}
      }
    };
    subscribe(); // immediate call on ready
    progressIntervalRef.current = setInterval(subscribe, 250);
    return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); };
  }, [playerReady]);

  // Auto-hide handled by useAutoHideControls hook above.

  const handleReplay = useCallback(() => { setShowEndScreen(false); setWatermarkForceVisible(false); seekTo(0); setTimeout(() => playVideo(), 200); }, [seekTo, playVideo]);
  const handleNextVideo = useCallback(() => { setShowEndScreen(false); onNextVideo?.(); }, [onNextVideo]);

  // Progress bar handlers
  // The progress bar lives INSIDE the rotated outer container (CSS transform
  // rotate). Pointer coords are always in screen space, so we transform them
  // into the bar's local horizontal space based on current rotation, otherwise
  // a tap maps to the wrong fraction → seek jumps to a random position and the
  // hover indicator falls off-screen.
  const rotationRef = useRef(0);
  useEffect(() => { rotationRef.current = rotation; }, [rotation]);

  const calculatePointer = useCallback((clientX: number, clientY: number) => {
    if (!progressBarRef.current || duration <= 0) return { ratio: 0, localX: 0 };
    const rect = progressBarRef.current.getBoundingClientRect();
    return pointerRatio(rect, clientX, clientY, rotationRef.current);
  }, [duration]);

  const calculateTimeFromPosition = useCallback((clientX: number, clientY: number = 0) => {
    return calculatePointer(clientX, clientY).ratio * duration;
  }, [calculatePointer, duration]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsSeeking(true);
    setCurrentTime(calculateTimeFromPosition(e.clientX, e.clientY));
    const handleMouseMove = (moveEvent: MouseEvent) => setCurrentTime(calculateTimeFromPosition(moveEvent.clientX, moveEvent.clientY));
    const handleMouseUp = (upEvent: MouseEvent) => {
      seekTo(calculateTimeFromPosition(upEvent.clientX, upEvent.clientY));
      setIsSeeking(false);
      showControlsNow(IDLE_HIDE_MS_AFTER_SEEK);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [calculateTimeFromPosition, seekTo, showControlsNow]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSeeking(true);
    const touch = e.touches[0];
    setCurrentTime(calculateTimeFromPosition(touch.clientX, touch.clientY));

    const handleTouchMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault();
      const t = moveEvent.touches[0];
      setCurrentTime(calculateTimeFromPosition(t.clientX, t.clientY));
    };
    const handleTouchEnd = (endEvent: TouchEvent) => {
      const t = endEvent.changedTouches[0];
      seekTo(calculateTimeFromPosition(t.clientX, t.clientY));
      setIsSeeking(false);
      showControlsNow(IDLE_HIDE_MS_AFTER_SEEK);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
    const handleTouchCancel = () => {
      setIsSeeking(false);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchCancel);
  }, [calculateTimeFromPosition, seekTo, showControlsNow]);

  const handleProgressHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const { ratio, localX } = calculatePointer(e.clientX, e.clientY);
    setHoverTime(ratio * duration);
    setHoverPosition(localX);
  }, [duration, calculatePointer]);

  const handleProgressLeave = useCallback(() => setHoverTime(null), []);

  const formatTime = formatPlayerTime;


  // formatRelativeTime removed — use formatRelativeTime from src/lib/utils.ts if needed

  const isLiveStream = isLiveStreamUrl(videoUrl);
  const embedUrl = youtubeId
    ? buildYoutubeEmbedUrl(youtubeId, { origin: window.location.origin, isLive: isLiveStream })
    : null;

  if (!youtubeId) {
    return (
      <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
        <p className="text-muted-foreground">Video not available</p>
      </div>
    );
  }


  const progressPercentage = percentOf(currentTime, duration);
  const bufferedPercentage = percentOf(bufferedTime, duration);

  // Rotation styles. On Capacitor (Android/iOS) we rely on native OS rotation,
  // so the player just goes fixed-inset fullscreen — NO css `transform: rotate`
  // on the iframe (that was causing the rotate/settings click freeze on the
  // Android WebView). On web, we keep the CSS-rotation fallback.
  const isLandscapeRotation = !useNativeRotation && (rotation === 90 || rotation === 270);
  const playerContainerStyle: React.CSSProperties = useNativeRotation && isFakeFullscreen ? {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 9999,
    borderRadius: 0,
    background: '#000',
    overflow: 'hidden',
  } : isLandscapeRotation ? {
    position: 'fixed',
    top: '50%',
    left: '50%',
    width: '100vh',
    height: '100vw',
    marginLeft: '-50vh',
    marginTop: '-50vw',
    transform: `rotate(${rotation}deg)`,
    transformOrigin: 'center center',
    transition: 'transform 0.3s ease',
    zIndex: 9999,
    borderRadius: 0,
    background: '#000',
    overflow: 'hidden',
  } : {};

  // Landscape Safar mask — portalled to <body> and anchored uniformly at the
  const shouldUseLandscapePortalMask = isLandscapeRotation || isFakeFullscreen;


  return (
    <>
      <link rel="preconnect" href="https://www.youtube-nocookie.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />

      <div
        ref={containerRef}
        className={cn(
          "mahima-ghost-player relative overflow-hidden bg-black select-none group",
          !isLandscapeRotation && "rounded-xl",
          isFakeFullscreen && "mahima-fake-fullscreen"
        )}
        onContextMenu={(e) => e.preventDefault()}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { if (isRecentTouch()) return; if (isPlaying && !showVolumeSlider) setShowControls(false); }}
        tabIndex={0}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation', ...playerContainerStyle }}
      >
        {/* Video Container — no rotation here; the entire outer player rotates together
             so all controls (play/skip/progress/settings/watermark) move as one unit */}
        <div
          className={cn(
            isFakeFullscreen ? 'mahima-video-container w-full h-full' : 'relative',
            !isFakeFullscreen && 'aspect-video'
          )}
          style={isFakeFullscreen ? {} : { position: 'relative' }}
        >
          {/* Thumbnail poster — shows before first play so there's no black screen */}
          {!isPlaying && !playerReady && youtubeId && (
            <div
              className="absolute inset-0 z-[5] bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url(https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg)` }}
            />
          )}

          {/* Stealth loading spinner — ring + JSR COACHING bird logo in center */}
          {(!playerReady || isBuffering) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-40 pointer-events-none">
              <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
                <div className="mahima-stealth-spinner" />
                <img
                  src={nbBirdLogo}
                  alt="JSR COACHING"
                  className="absolute rounded-full"
                  style={{
                    width: 44,
                    height: 44,
                    filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.8))',
                  }}
                />
              </div>
            </div>
          )}

          {/* YouTube iframe */}
          <iframe
            ref={playerRef}
            src={embedUrl!}
            title="JSR COACHING Video Player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            webkitallowfullscreen="true"
            mozallowfullscreen="true"
            referrerPolicy="strict-origin-when-cross-origin"
            className={cn("w-full border-0", isFakeFullscreen ? "h-full" : "h-full")}
            style={{ pointerEvents: 'none', visibility: showEndScreen ? 'hidden' as const : 'visible' as const }}
            loading="eager"
            onLoad={() => {
              setIsLoaded(true);
              // 300ms fallback — if YouTube's onReady postMessage fires first, this is a no-op
              readyFallbackRef.current = setTimeout(() => {
                setPlayerReady(prev => {
                  if (prev) return prev; // already set by onReady event
                  sendCommand("pauseVideo");
                  sendCommand("seekTo", [0, true]);
                  sendCommand("setVolume", volume);
                  setIsPlaying(false);
                  onReady?.();
                  return true;
                });
              }, 300);
            }}
          />

          {/* Pause cover — hides YouTube recommendations when paused */}
          {playerReady && !isPlaying && !isBuffering && !showEndScreen && (
            <div className="absolute inset-0 z-[6] bg-black/40 pointer-events-none" />
          )}
        </div>
        {/* ─── VIDEO IFRAME CLOSED — all overlays below ARE rotated (they're inside the outer rotating div) ─── */}

        {/* Brightness overlay — inside the rotating outer container, so it rotates correctly with the video */}
        {brightness !== 100 && (
          <div
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{ backgroundColor: brightness < 100 ? `rgba(0,0,0,${(100 - brightness) / 100})` : 'transparent' }}
          />
        )}

        <PlayerTopOverlay
          showControls={showControls}
          isFakeFullscreen={isFakeFullscreen}
          title={title}
          subtitle={subtitle}
          onExitFullscreen={() => { applyFullscreen(false); showControlsNow(); }}
          onBackgroundClick={handleTopOverlayClick}
        />

        <PlayerBrandMasks
          showInfinityLogo={showInfinityLogo}
          showYoutubeMask={showYoutubeMask}
          isLandscapeRotation={isLandscapeRotation}
          isFakeFullscreen={isFakeFullscreen}
        />


        {/* GHOST OVERLAY — inside the rotating outer container, so all controls rotate correctly with the video. */}
        <div
          className="absolute inset-0 z-40"
            onClick={handleOverlayTap}
            onTouchStart={(e) => {
              lastTouchAtRef.current = Date.now();
              tapProbe.mark("touchstart");
              // If touch landed on a child button (play/skip), skip gesture logic entirely
              const target = e.target as HTMLElement;
              const closestControl = target.closest('[data-player-control="true"], button');
              if (closestControl) {
                touchStartedOnControlRef.current = true;
                suppressTapToggleRef.current = true;
                handleOverlayTouchStart(e);
                return;
              }

              touchStartedOnControlRef.current = false;

              // Fresh gesture: assume it's a genuine tap until proven otherwise
              // (swipe lock / double-tap / long-press will suppress the toggle).
              suppressTapToggleRef.current = false;

              const touch = e.touches[0];
              const container = containerRef.current;
              if (!container) { handleOverlayTouchStart(e); return; }
              const rect = container.getBoundingClientRect();

              // ── Rotation-aware side detection ─────────────────────────────
              let side: 'left' | 'right';
              if (rotation === 90) {
                side = touch.clientY - rect.top < rect.height / 2 ? 'left' : 'right';
              } else if (rotation === 270) {
                side = touch.clientY - rect.top > rect.height / 2 ? 'left' : 'right';
              } else {
                side = touch.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
              }
              // ─────────────────────────────────────────────────────────────

              // ── Rotation-aware center-zone detection (middle 30%) ─────────
              // Center zone double-tap = play/pause (works in portrait + landscape).
              // Edge zones (left/right 35%) keep existing skip ±10s behavior.
              let axisPos: number; // 0..1 along the gesture axis
              if (rotation === 90) {
                axisPos = (touch.clientY - rect.top) / rect.height;
              } else if (rotation === 270) {
                axisPos = (rect.bottom - touch.clientY) / rect.height;
              } else if (rotation === 180) {
                axisPos = (rect.right - touch.clientX) / rect.width;
              } else {
                axisPos = (touch.clientX - rect.left) / rect.width;
              }
              const tapZone: 'center' | 'edge' = (axisPos > 0.35 && axisPos < 0.65) ? 'center' : 'edge';
              // ─────────────────────────────────────────────────────────────

              // ── Double-tap detection (must run BEFORE the instant-toggle
              //    branch below — otherwise a quick second tap that the user
              //    intends as "skip ±10s" or "play/pause" gets eaten by the
              //    show/hide toggle). ────────────────────────────────────────
              const now = Date.now();
              const last = lastTapRef.current;
              if (last && now - last.time < 300 && last.zone === tapZone && (tapZone === 'center' || last.side === side)) {
                clearTimeout(doubleTapTimerRef.current);
                clearTimeout(longPressTimerRef.current); // cancel long-press on double-tap
                lastTapRef.current = null;
                suppressTapToggleRef.current = true; // double-tap is not a single tap
                // The first tap of a double-tap already toggled instantly on
                // touchStart. Restore chrome before executing the double-tap
                // action so skip/play-pause never leaves controls inverted.
                showControlsNow();
                if (tapZone === 'center') {
                  // Center double-tap → play/pause (no skip, no ripple)
                  togglePlay();
                } else if (side === 'left') {
                  skipBackward();
                  setDoubleTapRipple({ side, key: now });
                  setTimeout(() => setDoubleTapRipple(null), 750);
                } else {
                  skipForward();
                  setDoubleTapRipple({ side, key: now });
                  setTimeout(() => setDoubleTapRipple(null), 750);
                }
                return;
              }
              lastTapRef.current = { time: now, side, zone: tapZone };
              clearTimeout(doubleTapTimerRef.current);
              doubleTapTimerRef.current = setTimeout(() => { lastTapRef.current = null; }, 300);
              // ─────────────────────────────────────────────────────────────

              // ── TAP-TOGGLE deferred to touchEnd (master-skill rule) ───────
              // Firing toggle on touchStart flashes chrome at the start of
              // every swipe / double-tap / long-press. touchEnd path below
              // handles the clean ON↔OFF flip when none of those gestures
              // ended up firing (see suppressTapToggleRef checks).
              // ─────────────────────────────────────────────────────────────

              // ── Long-press 2x speed (YouTube-style hold) ─────────────────
              // If the long-press fires, suppress the eventual touchEnd tap
              // so chrome doesn't toggle when the user releases the hold.
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = setTimeout(() => {
                longPressSpeedBeforeRef.current = playbackSpeed;
                sendCommand("setPlaybackRate", 2);
                setIsLongPressSpeed(true);
                suppressTapToggleRef.current = true; // long-press is not a tap
              }, 500);
              // ─────────────────────────────────────────────────────────────

              // Swipe gesture detection (MX Player-style)
              swipeTouchRef.current = {
                startY: touch.clientY,
                startX: touch.clientX,
                startVal: side === 'left' ? brightness : (isMuted ? 0 : volume),
                side,
                locked: false,
                mode: null,
                startTime: currentTime,
              };
              handleOverlayTouchStart(e);
            }}
            onTouchMove={(e) => {
              lastTouchAtRef.current = Date.now();
              // If finger moved significantly, cancel long-press
              const ref = swipeTouchRef.current;
              if (ref) {
                const t = e.touches[0];
                const movedX = Math.abs(t.clientX - ref.startX);
                const movedY = Math.abs(t.clientY - ref.startY);
                if (movedX > 10 || movedY > 10) {
                  clearTimeout(longPressTimerRef.current);
                }
              }

              if (!ref) return;
              const touch = e.touches[0];
              const deltaY = touch.clientY - ref.startY;
              const deltaX = touch.clientX - ref.startX;
              const container = containerRef.current;
              const rect = container?.getBoundingClientRect();
              const height = rect?.height || window.innerHeight || 600;

              // ── Rotation-aware gesture axes ───────────────────────────────
              // Map raw screen-space deltas onto what the USER perceives as
              // vertical (volume/brightness) vs horizontal (seek). With CSS
              // rotation the visual axes are swapped, so we must remap or a
              // vertical volume swipe gets misread as a horizontal seek (skip).
              // gVert: + = swiped visually DOWN, gHoriz: + = swiped visually RIGHT
              let gVert: number;
              let gHoriz: number;
              // CSS rotate(90deg) is visually clockwise. At rotation=90 the
              // video's top edge sits on the physical RIGHT, so a "visually
              // up" swipe = finger moves physically right (deltaX > 0).
              // gVert convention: + = swiped visually DOWN.
              if (rotation === 90) { gVert = -deltaX; gHoriz = deltaY; }
              else if (rotation === 270) { gVert = deltaX; gHoriz = -deltaY; }
              else if (rotation === 180) { gVert = -deltaY; gHoriz = -deltaX; }
              else { gVert = deltaY; gHoriz = deltaX; }
              const vertMag = Math.abs(gVert);
              const horizMag = Math.abs(gHoriz);
              // ──────────────────────────────────────────────────────────────

              // Lock gesture mode on first significant move (rotation-aware).
              if (!ref.locked) {
                const isLandscape = rotation === 90 || rotation === 270;
                // In landscape, horizontal (visual) swipes scrub time.
                if (isLandscape && horizMag > vertMag * 1.5 && horizMag > 20) {
                  ref.mode = 'seek';
                  ref.locked = true;
                } else if (vertMag > horizMag && vertMag > 8) {
                  ref.mode = 'value';
                  ref.locked = true;
                } else {
                  return;
                }
              }

              e.stopPropagation();

              if (ref.mode === 'seek') {
                // ±60s for a full-width swipe (uses the visual-horizontal axis).
                const width = rect?.width || window.innerWidth || 800;
                const seekDelta = (gHoriz / width) * 120;
                const newT = Math.max(0, Math.min((duration || 0), ref.startTime + seekDelta));
                if (swipeIndicatorTimer.current) clearTimeout(swipeIndicatorTimer.current);
                setSwipeIndicator({
                  type: 'volume', // reuse pill UI
                  value: Math.round((newT / Math.max(1, duration)) * 100),
                  visible: true,
                });
                swipeSeekTargetRef.current = newT;
                if (swipeSeekRafRef.current == null) {
                  swipeSeekRafRef.current = requestAnimationFrame(() => {
                    swipeSeekRafRef.current = null;
                    seekTo(swipeSeekTargetRef.current, false);
                  });
                }
                return;
              }

              // value mode (brightness/volume) — height-proportional sensitivity:
              // ~60% of the screen height = full 0→100 sweep.
              // Swipe up (gVert negative) = increase.
              const effectiveDelta = -gVert;

              const sensitivity = 100 / (height * 0.6);
              const min = 0;
              const max = 100;
              const newVal = Math.max(min, Math.min(max, ref.startVal + effectiveDelta * sensitivity));
              if (ref.side === 'left') applyBrightness(newVal);
              else setPlayerVolume(newVal);
              if (swipeIndicatorTimer.current) clearTimeout(swipeIndicatorTimer.current);
              setSwipeIndicator({ type: ref.side === 'left' ? 'brightness' : 'volume', value: newVal, visible: true });
            }}
            onTouchEnd={() => {
              lastTouchAtRef.current = Date.now();
              // Cancel long-press timer
              clearTimeout(longPressTimerRef.current);
              // If we were in long-press 2x mode, restore original speed
              if (isLongPressSpeed) {
                sendCommand("setPlaybackRate", longPressSpeedBeforeRef.current);
                setPlaybackSpeed(longPressSpeedBeforeRef.current);
                setIsLongPressSpeed(false);
              }
              const wasLocked = !!swipeTouchRef.current?.locked;
              const startedOnControl = touchStartedOnControlRef.current;
              touchStartedOnControlRef.current = false;
              swipeTouchRef.current = null;
              if (swipeIndicatorTimer.current) clearTimeout(swipeIndicatorTimer.current);
              // Only auto-hide indicator if it was actually shown (real swipe).
              if (wasLocked) {
                swipeIndicatorTimer.current = setTimeout(() => setSwipeIndicator(null), 1500);
              } else {
                setSwipeIndicator(null);
              }
              // Genuine single tap → toggle controls (deferred from touchStart to
              // eliminate flicker). Suppressed for swipes, double-taps, long-press.
              if (!startedOnControl && !wasLocked && !suppressTapToggleRef.current) {
                // Stamp BEFORE the toggle so the synthetic mouse click that
                // mobile WebKit/Blink fires ~50–300ms after touchEnd is
                // deduped by handleOverlayTap (was previously always 0 →
                // every tap double-fired show+hide = looked dead).
                lastTouchToggleAtRef.current = Date.now();
                toggleControlsSoft();
              }
              suppressTapToggleRef.current = false;
            }}
            onTouchCancel={() => {
              clearTimeout(longPressTimerRef.current);
              if (isLongPressSpeed) {
                sendCommand("setPlaybackRate", longPressSpeedBeforeRef.current);
                setPlaybackSpeed(longPressSpeedBeforeRef.current);
                setIsLongPressSpeed(false);
              }
              swipeTouchRef.current = null;
            }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragStart={(e) => e.preventDefault()}
            style={{
              background: 'transparent',
              cursor: showControls ? 'default' : 'none',
              // Kill Android WebView's ~300ms double-tap-zoom delay so tap-to-toggle
              // feels instant. We handle our own double-tap (skip ±10s) manually.
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* ── Double-tap ripple (YouTube-style) ── */}
            <DoubleTapRipple ripple={doubleTapRipple} />

            {/* Swipe Indicator Pill (brightness / volume) */}
            <SwipeIndicatorPill indicator={swipeIndicator} />

            {/* ── Long-press 2x speed indicator ── */}
            <LongPressSpeedBadge active={isLongPressSpeed} />


            <PlayerCenterControls
              showControls={showControls}
              isPlaying={isPlaying}
              isLandscapeRotation={isLandscapeRotation}
              isFakeFullscreen={isFakeFullscreen}
              isPortrait={isPortrait}
              onTogglePlay={togglePlay}
              onSkipBackward={skipBackward}
              onSkipForward={skipForward}
              onShowControls={showControlsNow}
            />
          </div>

          {/* End Screen + click blocker */}
          {showEndScreen && (
            <>
              {/* Invisible click blocker over iframe */}
              <div className="absolute inset-0 z-[2147483646]" style={{ background: 'transparent' }} />
              <EndScreenOverlay
                onReplay={handleReplay}
                onNextVideo={nextVideoUrl ? handleNextVideo : undefined}
                nextVideoTitle={nextVideoTitle}
              />
            </>
          )}

          {/* BOTTOM CONTROLS BAR */}
        <div
          // @ts-expect-error - `inert` is a valid HTML attribute; older React types may not include it.
          inert={showControls ? undefined : ""}
          className={cn(
            "absolute left-0 right-0 bottom-0 z-50 pt-1 md:pt-2 pb-1.5 md:pb-2.5",
            isLandscapeRotation ? "px-8 md:px-10" : "px-3 md:px-4",
            showControls ? "opacity-100 transition-opacity duration-100 ease-out motion-reduce:transition-none" : "opacity-0 pointer-events-none transition-opacity duration-75 ease-in motion-reduce:transition-none",
            showEndScreen && "hidden"
          )}
          style={{
            paddingBottom: isFakeFullscreen ? 'max(12px, env(safe-area-inset-bottom, 0px))' : undefined,
            // Landscape safe-area lateral insets (audit H-4): iPhone notch
            // (left in landscape) and Android hole-punch camera cutouts
            // used to obscure the back arrow, play button, and timer.
            paddingLeft: isFakeFullscreen
              ? 'env(safe-area-inset-left, 0px)'
              : isLandscapeRotation
                ? 'max(16px, env(safe-area-inset-left, 0px))'
                : undefined,
            paddingRight: isFakeFullscreen
              ? 'env(safe-area-inset-right, 0px)'
              : isLandscapeRotation
                ? 'max(16px, env(safe-area-inset-right, 0px))'
                : undefined,
          }}
          onMouseMove={handleMouseMove}
          // Tap on the bar's own background (not on a child button / seek bar) → hide controls.
          // Lets students take notes by instantly clearing the chrome with one tap, in
          // portrait OR landscape. Buttons inside use stopPropagation so they still work.
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (Date.now() - lastTouchToggleAtRef.current < 350) return;
            toggleControlsSoft();
          }}
        >

          {/* Premium seek bar — chapters, quiz markers, bookmarks, a11y */}
          <div
            style={{
              // Portrait-only: nudge seek bar ~12px down.
              transform: isPortrait && !isLandscapeRotation && !isFakeFullscreen ? 'translateY(12px)' : undefined,
            }}
          >
            <SeekBar
              currentTime={currentTime}
              duration={duration}
              buffered={duration > 0 ? bufferedTime / duration : 0}
              chapters={chapters}
              quizMarkers={quizMarkers}
              bookmarks={bookmarks}
              rotation={rotation as 0 | 90 | 180 | 270}
              onSeek={(s) => seekTo(s, true)}
              onBookmarkClick={(b) => { setActiveBookmark(b); setBookmarkDialogOpen(true); }}
              className="mb-0 md:mb-0.5"
            />
          </div>






          {/* Controls Row */}
            <div className="flex items-center justify-between">
            <div className={cn("flex items-center", !isLandscapeRotation && "-ml-2 md:-ml-1")}>
              {/* Hide small left-bottom play button in landscape — big center play/pause remains. */}
              {!shouldUseLandscapePortalMask && (
                <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10 text-white hover:bg-white/20" onClick={() => { togglePlay(); showControlsNow(); }}>
                  {isPlaying ? <Pause className="h-4 w-4 md:h-5 md:w-5" fill="white" /> : <Play className="h-4 w-4 md:h-5 md:w-5 ml-0.5" fill="white" />}
                </Button>
              )}



              {/* Time — pushed right with margin to clear bird logo */}
              <span className={cn(
                "text-white text-xs md:text-sm font-mono whitespace-nowrap tabular-nums",
                isLandscapeRotation ? "ml-24 md:ml-28" : "ml-10 md:ml-12"
              )}>
                {formatTime(currentTime)} / {formatTime(duration)}
                {isLandscapeRotation && duration > 0 && (
                  <span className="ml-1.5 text-white/70">({Math.round((currentTime / duration) * 100)}%)</span>
                )}
              </span>

              {/* Bookmark current position */}
              {lessonId && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Bookmark this moment"
                  className="h-7 w-7 md:h-9 md:w-9 text-white hover:bg-white/20 ml-1 rounded-full"
                  onClick={async () => {
                    showControlsNow();
                    const created = await addBookmarkAndReturn(currentTime);
                    if (created) {
                      setActiveBookmark(created);
                      setBookmarkDialogOpen(true);
                    } else {
                      toast.error("Could not add bookmark");
                    }
                  }}
                >
                  <BookmarkIcon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </Button>
              )}

            </div>


            {/* Spacer to push right controls to the edge */}
            <div className="flex-1" />

            {/* Right controls — settings + rotate (larger touch targets for visibility) */}
            <div className="flex items-center gap-3">
              <PlayerSettingsMenu
                showControls={showControls}
                showSpeedMenu={showSpeedMenu}
                playbackSpeed={playbackSpeed}
                onToggleMenu={() => { showControlsNow(); setShowSpeedMenu(!showSpeedMenu); }}
                onSetSpeed={setSpeed}
              />

              {/* Rotate button (above mask) */}
              <button
                className="h-12 w-12 md:h-13 md:w-13 flex items-center justify-center outline-none focus:outline-none pointer-events-auto active:scale-90 transition-transform relative z-10 focus-visible:ring-2 focus-visible:ring-white/80 rounded-md"
                onClick={(e) => { e.stopPropagation(); rotateCW(); showControlsNow(); }}
                title="Rotate screen (90°)"
                aria-label="Rotate screen"
              >
                <RotatePhoneIcon
                  className="h-8 w-8 md:h-9 md:w-9 text-white pointer-events-none"
                  style={{ filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.95))' }}
                />
              </button>
            </div>

          </div>
        </div>


      </div>

      <BookmarkNoteDialog
        open={bookmarkDialogOpen}
        bookmark={activeBookmark}
        onOpenChange={setBookmarkDialogOpen}
        onSave={async (id, note) => { await updateBookmark(id, note || null); toast.success("Note saved"); }}
        onDelete={async (id) => { await removeBookmark(id); toast.success("Bookmark removed"); }}
        onJump={(s) => seekTo(s, true)}
      />
    </>
  );
});

MahimaGhostPlayer.displayName = "MahimaGhostPlayer";

export default MahimaGhostPlayer;
