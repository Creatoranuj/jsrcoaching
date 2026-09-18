import React, { useRef, useState, useEffect, useCallback } from 'react';
import ReactPlayer from 'react-player/youtube';
import { Play, Pause, Volume2, VolumeX, Loader2 } from 'lucide-react';
import PlayerIcon from './PlayerIcon';
import { lockOrientation, unlockOrientation } from '../../lib/screenOrientation';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useAutoHideControls } from './hooks/useAutoHideControls';
import playButtonIcon from '../../assets/icons/play-button.svg';
import { SkipIcon } from './SkipIcon';

interface MahimaVideoPlayerProps {
  videoUrl: string;
  onEnded?: () => void;
  onReady?: () => void;
  /** Callback with actual video duration in seconds */
  onDurationReady?: (duration: number) => void;
}

/**
 * MahimaVideoPlayer - Enhanced Secure Video Player
 * 
 * Features:
 * 1. Full "JSR COACHING" watermark covering YouTube logo (bottom-right)
 * 2. No share button, no related videos, no end cards
 * 3. Right-click/context menu disabled
 * 4. Ghost watermarks with user email/ID for anti-piracy
 * 5. Custom controls - no YouTube controls visible
 */
const MahimaVideoPlayer: React.FC<MahimaVideoPlayerProps> = ({ videoUrl, onEnded, onReady, onDurationReady }) => {
  const playerRef = useRef<ReactPlayer>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  

  const { user, profile } = useAuth();

  // Player state
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [watermarkFaded, setWatermarkFaded] = useState(false);
  const [played, setPlayed] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);

  // UI state
  const [cursorHidden, setCursorHidden] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  // Centralised auto-hide controls logic — visible while paused / locked,
  // hides 3s after the last interaction while playing.
  const {
    visible: controlsVisible,
    kick: kickTimer,
    forceHide: hideControlsNow,
    toggle: toggleControls,
  } = useAutoHideControls({
    isPlaying: playing,
    isLocked: showSettings || showVolumeSlider || seeking || !isReady || isBuffering,
    delay: 3000,
  });

  // Extract YouTube ID from various URL formats
  const extractYouTubeId = (url: string): string => {
    if (!url) return '';
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return url;
  };

  const videoId = extractYouTubeId(videoUrl);
  const fullVideoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : videoUrl;

  // Get short user ID for subtle anti-piracy watermark
  const getShortId = (): string => {
    return user?.id != null ? String(user.id).slice(-6).toUpperCase() : '';
  };
  const shortId = getShortId();

  // Sync cursor visibility with controls visibility
  useEffect(() => {
    setCursorHidden(!controlsVisible);
  }, [controlsVisible]);

  // Wire pointer activity to the auto-hide hook (desktop hover only).
  // Touch is handled by the dedicated tap-toggle overlay below so a single tap
  // alternates show ↔ hide instead of both events firing on the same tap.
  //
  // IMPORTANT: we MUST filter to real mouse pointers. Mobile WebViews (Android
  // Chrome / iOS Safari / Capacitor) dispatch a synthetic `mousemove` ~50ms
  // after every touch tap. If we listened to `mousemove` directly, that
  // synthetic event would call kick() → setVisible(true) → userHiddenRef=false,
  // instantly re-showing the controls the user just tapped to hide. Using
  // `pointermove` with a `pointerType === 'mouse'` guard ignores those
  // synthetic events while still tracking real desktop hover.
  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const handleActivity = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      kickTimer();
    };
    node.addEventListener('pointermove', handleActivity);
    return () => {
      node.removeEventListener('pointermove', handleActivity);
    };
  }, [kickTimer]);


  const seekBy = useCallback((seconds: number) => {
    if (playerRef.current && duration > 0) {
      const currentTime = playerRef.current.getCurrentTime();
      playerRef.current.seekTo(Math.max(0, Math.min(duration, currentTime + seconds)));
      kickTimer();
    }
  }, [duration, kickTimer]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setPlaying(p => !p);
          kickTimer();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(v => Math.min(1, v + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(v => Math.max(0, v - 0.1));
          break;
        case 'KeyM':
          setMuted(m => !m);
          break;
        case 'KeyF':
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [kickTimer, seekBy]);

  // Fullscreen detection — reconciles state when user exits via gesture / back btn,
  // and always restores body.overflow (white-screen guard).
  useEffect(() => {
    const popPlayerFullscreenSentinel = () => {
      // Only pop OUR sentinel, never a stranger's history entry.
      try {
        if (window.history.state?.playerFullscreen) {
          window.history.back();
        }
      } catch { /* noop */ }
    };
    const handleFullscreenChange = () => {
      const real = !!document.fullscreenElement;
      setIsFullscreen(real);
      if (!real) {
        document.body.style.overflow = "";
        // Always restore portrait when leaving fullscreen via any path
        // (ESC, swipe-down, hardware back, gesture).
        unlockOrientation().catch(() => {});
        // CRITICAL: pop the playerFullscreen sentinel pushed in
        // toggleFullscreen. Without this, the next hardware back press is
        // silently swallowed by useAndroidBackButton step-1 — user thinks
        // back is broken.
        popPlayerFullscreenSentinel();
      }
    };
    // CRITICAL: when useAndroidBackButton pops the `playerFullscreen`
    // sentinel via `history.back()`, that alone does NOT call
    // `document.exitFullscreen()` — so `fullscreenchange` never fires and
    // the player stays landscape+fullscreen while the sentinel is gone.
    // The NEXT back then falls through to route navigation and the user
    // perceives a single back = exit LessonView. Explicitly reconcile on
    // popstate: if the sentinel is gone but we still think we're
    // fullscreen, tear down (exit fullscreen, restore portrait, sync state).
    const handlePopState = () => {
      if (window.history.state?.playerFullscreen) return;
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      document.body.style.overflow = "";
      unlockOrientation().catch(() => {});
      setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('popstate', handlePopState);
      document.body.style.overflow = "";
      unlockOrientation().catch(() => {});
      // Unmount cleanup — if the user navigates away while still fullscreen,
      // make sure the orphaned sentinel doesn't outlive the component.
      popPlayerFullscreenSentinel();
    };
  }, []);

  // Prevent context menu (right-click)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  };

  const toggleFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        document.body.style.overflow = "";
        await document.exitFullscreen?.();
        await unlockOrientation();
      } else {
        document.body.style.overflow = "hidden";
        try { window.history.pushState({ playerFullscreen: true }, ""); } catch {}
        const req =
          el.requestFullscreen ||
          el.webkitRequestFullscreen ||
          el.mozRequestFullScreen;
        if (req) await req.call(el);
        else setIsFullscreen(true); // pseudo-fullscreen fallback
        // Lock to landscape on the way in — single tap = fullscreen + rotate.
        await lockOrientation('landscape');
      }
    } catch {
      // Pseudo-fullscreen fallback — state is authoritative
      setIsFullscreen((s) => !s);
    }
  };

  const handleProgress = (state: { played: number; loaded: number; playedSeconds: number }) => {
    if (!seeking) {
      setPlayed(state.played);
      setLoaded(state.loaded);
    }
    if (state.playedSeconds > 8 && !watermarkFaded) {
      setWatermarkFaded(true);
    }
  };

  // Compute seek fraction from a pointer/touch/mouse event.
  // Always re-measures the bar's rect (important after fullscreen reparenting
  // on Android WebView where cached rects become stale and cause random jumps).
  const computeSeekFraction = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
    const bar = progressRef.current;
    if (!bar || bar.offsetWidth === 0) return null;
    const rect = bar.getBoundingClientRect();
    let clientX: number | undefined;
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
    } else if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    } else if ('clientX' in e) {
      clientX = (e as React.PointerEvent).clientX;
    }
    if (clientX === undefined || rect.width <= 0) return null;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleSeekMouseDown = () => setSeeking(true);

  const handleSeekChange = (e: React.PointerEvent<HTMLDivElement>) => {
    const fraction = computeSeekFraction(e);
    if (fraction !== null) setPlayed(fraction);
  };

  const handleSeekCommit = (e: React.PointerEvent<HTMLDivElement>) => {
    setSeeking(false);
    const fraction = computeSeekFraction(e);
    if (fraction !== null && isFinite(fraction)) {
      playerRef.current?.seekTo(fraction);
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    setShowSettings(false);
  };

  const handlePlayerReady = () => {
    setIsReady(true);
    setHasError(false);
    onReady?.();
  };

  const handlePlayerError = () => {
    setHasError(true);
    setIsReady(false);
  };

  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  if (!videoUrl) {
    return (
      <div className="aspect-video bg-black rounded-xl flex items-center justify-center">
        <p className="text-white/50">No video URL provided</p>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative w-full bg-black rounded-xl overflow-hidden select-none group",
        cursorHidden && "cursor-none",
        isFullscreen && "!rounded-none"
      )}
      onContextMenu={handleContextMenu}
      style={{ userSelect: 'none' }}
    >
      {/* Video Player */}
      <div className={cn("relative", isFullscreen ? "h-full w-full" : "aspect-video")}>
        <ReactPlayer
          ref={playerRef}
          url={fullVideoUrl}
          width="100%"
          height="100%"
          playing={playing}
          muted={muted}
          volume={volume}
          playbackRate={playbackRate}
          onProgress={handleProgress}
          onDuration={(dur) => {
            setDuration(dur);
            onDurationReady?.(dur);
          }}
          onEnded={onEnded}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onReady={handlePlayerReady}
          onError={handlePlayerError}
          onBuffer={() => setIsBuffering(true)}
          onBufferEnd={() => setIsBuffering(false)}
          controls={false}
          playsinline
          config={{
            playerVars: {
              rel: 0,                    // No related videos at end
              modestbranding: 1,         // Minimal YouTube branding
              iv_load_policy: 3,         // Hide annotations
              showinfo: 0,               // Hide video info
              controls: 0,               // Hide YouTube controls (using custom)
              disablekb: 1,              // Disable keyboard (we handle it)
              fs: 0,                     // Hide fullscreen (we handle it)
              playsinline: 1,
              end: 0,                    // Prevent end screen
              autoplay: 0,
              cc_load_policy: 0,         // Hide captions by default
              origin: window.location.origin,
              // Trick: setting playlist to same videoId suppresses
              // YouTube's "More videos" end-screen recommendations.
              playlist: videoId,
              loop: 0,
            },
          }}
        />

        {/* Tap-to-toggle controls — always present while ready (works during
            play, pause, and buffering). Single tap toggles instantly.
            Only `onClick` is used; `touchAction: manipulation` removes the
            300ms WebView delay AND prevents the double-fire (touchEnd + click)
            that caused the previous flicker-and-revert behavior. */}
        {isReady && !hasError && (
          <button
            type="button"
            aria-label={controlsVisible ? "Hide controls" : "Show controls"}
            className="absolute inset-0 z-10 w-full h-full bg-transparent cursor-pointer focus:outline-none"
            onClick={(e) => { e.stopPropagation(); toggleControls(); }}
            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
          />
        )}


        {/* Loading Overlay */}
        {(!isReady || isBuffering) && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-3" />
              <p className="text-white/70 text-sm">{isBuffering ? 'Buffering...' : 'Loading video...'}</p>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
            <div className="text-center px-6">
              <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-white font-medium mb-2">Video unavailable</p>
              <p className="text-white/50 text-sm">Unable to load this video. Please try again later.</p>
            </div>
          </div>
        )}

        {/* Big play button when paused */}
        {!playing && isReady && !hasError && (
          <div 
            className="absolute inset-0 flex flex-row items-center justify-center z-20 cursor-pointer bg-black/60 backdrop-blur-sm"
            onClick={() => { setPlaying(true); kickTimer(); }}
          >
            <button
              className="bg-transparent border-none transition-transform duration-200 active:scale-90"
              title="Play/Pause"
              aria-label="Play/Pause"
            >
              <img 
                src={playButtonIcon} 
                alt="Play/Pause" 
                className="w-20 h-20 hover:scale-110 transition-transform duration-300"
                style={{ filter: 'drop-shadow(0px 4px 12px rgba(0,0,0,0.9))' }}
              />
            </button>
          </div>
        )}

        {/* ============================================= */}
        {/* ANTI-PIRACY OVERLAY - Ghost watermark only (no visible branding per user request) */}
        {/* ============================================= */}
        <div 
          className="absolute inset-0 z-30 pointer-events-none overflow-hidden"
          style={{ userSelect: 'none', transition: 'opacity 2s ease', opacity: watermarkFaded ? 0.15 : 0.5 }}
          aria-hidden="true"
        >
          {shortId && (
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-4 p-12">
              {[...Array(9)].map((_, i) => (
                <div
                  key={`tile-${i}`}
                  className="flex items-center justify-center text-xs font-medium whitespace-nowrap transform -rotate-45 select-none"
                  style={{ fontFamily: 'monospace', color: `rgba(255,255,255,${watermarkFaded ? 0.003 : 0.01})` }}
                >
                  {shortId}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Share button blocker - covers bottom-left area where Share appears */}
        <div 
          className="absolute bottom-12 left-0 w-20 h-16 z-35 pointer-events-auto"
          style={{ background: 'transparent' }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onContextMenu={(e) => e.preventDefault()}
        />
        
        {/* Top-left blocker for channel watermark/logo */}
        <div 
          className="absolute top-0 left-0 w-48 h-14 z-35 pointer-events-auto"
          style={{ background: 'transparent' }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {/* Custom Control Bar */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 z-40 transition-all duration-300",
          controlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/10 to-transparent pointer-events-none max-h-16" />

        {/* Progress bar */}
        <div 
          ref={progressRef}
          className="relative h-3 -my-1 mx-4 mt-2 cursor-pointer group/progress touch-none"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            handleSeekMouseDown();
            handleSeekChange(e);
          }}
          onPointerMove={(e) => {
            if (seeking) handleSeekChange(e);
          }}
          onPointerUp={(e) => {
            handleSeekCommit(e);
            try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch {}
          }}
          onPointerCancel={() => setSeeking(false)}
        >
          {/* visible 1px track centered inside the larger touch target */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-white/20 rounded-full" />
          <div 
            className="absolute top-1/2 -translate-y-1/2 h-1 left-0 bg-white/40 rounded-full"
            style={{ width: `${loaded * 100}%` }}
          />
          <div 
            className="absolute top-1/2 -translate-y-1/2 h-1 left-0 bg-primary rounded-full transition-all"
            style={{ width: `${played * 100}%` }}
          />
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-lg"
            style={{ left: `calc(${played * 100}% - 6px)` }}
          />
        </div>

        {/* Controls row */}
        <div className="relative flex items-center gap-2 px-4 py-3">
          {/* Play/Pause */}
          <button
            onClick={() => setPlaying(p => !p)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            disabled={!isReady || hasError}
          >
            {playing ? (
              <Pause className="w-5 h-5 text-white" fill="white" />
            ) : (
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            )}
          </button>

          {/* Skip backward */}
          <button
            onClick={() => seekBy(-10)}
            className="p-2 bg-transparent border-none transition-transform duration-200 active:scale-90"
            disabled={!isReady || hasError}
            title="Backward 10s"
            aria-label="Backward 10s"
          >
            <SkipIcon direction="back" className="w-5 h-5" style={{ filter: 'drop-shadow(0px 4px 12px rgba(0,0,0,0.9))' }} />
          </button>

          {/* Skip forward */}
          <button
            onClick={() => seekBy(10)}
            className="p-2 bg-transparent border-none transition-transform duration-200 active:scale-90"
            disabled={!isReady || hasError}
            title="Forward 10s"
            aria-label="Forward 10s"
          >
            <SkipIcon direction="forward" className="w-5 h-5" style={{ filter: 'drop-shadow(0px 4px 12px rgba(0,0,0,0.9))' }} />
          </button>

          {/* Volume */}
          <div className="relative flex items-center">
            <button
              onClick={() => setMuted(m => !m)}
              onMouseEnter={() => setShowVolumeSlider(true)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-5 h-5 text-white" />
              ) : (
                <Volume2 className="w-5 h-5 text-white" />
              )}
            </button>
            
            {showVolumeSlider && (
              <div 
                className="flex items-center ml-1"
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    setMuted(false);
                  }}
                  className="w-20 h-1 accent-primary cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Time display */}
          <div className="text-white text-sm font-medium ml-2">
            {formatTime(played * duration)} / {formatTime(duration)}
          </div>

          {/* Quality badge */}
          <div className="px-2 py-1 bg-white/10 rounded text-xs text-white font-medium hidden sm:block">
            Auto / HD
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Playback Speed */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(s => !s)}
              className="p-3 rounded-full hover:bg-white/10 transition-colors flex items-center gap-1 min-h-12 min-w-12 justify-center"
              aria-label="Playback settings"
            >
              <PlayerIcon kind="settings" className="w-6 h-6" alt="Playback settings" />
              {playbackRate !== 1 && (
                <span className="text-xs text-primary font-semibold">{playbackRate}x</span>
              )}
            </button>

            {showSettings && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/40 backdrop-blur-xl border border-white/15 rounded-2xl py-1.5 min-w-[110px] shadow-2xl ring-1 ring-white/5 overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-150">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-white/60 font-medium">
                  Speed
                </div>
                <div className="max-h-[45vh] overflow-y-auto">
                  {playbackRates.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-sm transition-colors tabular-nums",
                        "[@media(hover:hover)]:hover:bg-white/10 active:bg-white/15",
                        rate === playbackRate ? "text-primary font-semibold" : "text-white/90"
                      )}
                    >
                      {rate}x{rate === 1 && <span className="text-white/50 text-xs ml-1">Normal</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rotate + Fullscreen (single tap triggers both) */}
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Rotate to landscape & fullscreen'}
            className="p-3 rounded-full hover:bg-white/10 transition-colors min-h-12 min-w-12 flex items-center justify-center"
          >
            <PlayerIcon
              kind="rotate"
              className={`w-6 h-6 transition-transform ${isFullscreen ? 'rotate-90' : ''}`}
              alt={isFullscreen ? 'Exit fullscreen' : 'Rotate to landscape'}
            />
          </button>
        </div>
      </div>

      {/* Saffron accent bar */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-px opacity-15 z-50"
        style={{ background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--brand-accent-hover)))' }}
      />
    </div>
  );
};

export default MahimaVideoPlayer;

// Helper to format duration for display in lesson titles
export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '0m';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
};
