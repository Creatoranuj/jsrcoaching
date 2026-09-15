import { useRef, useState, useCallback, useEffect, memo } from "react";
import { useOrientation } from "../../hooks/useOrientation";
import { useVideoStatusBarHide } from "../../hooks/useVideoStatusBarHide";
import nbLogo from "../../assets/branding/jsr-mark.webp";

interface BunnyStreamPlayerProps {
  url: string;
  title?: string;
  subtitle?: string;
  onEnded?: () => void;
  onReady?: () => void;
}

export const parseBunnyStreamUrl = (
  raw: string
): { libraryId: string; videoId: string } | null => {
  const match = raw.match(
    /(?:player|iframe)\.mediadelivery\.net\/embed\/(\d+)\/([a-f0-9-]{36})/i
  );
  if (match) return { libraryId: match[1], videoId: match[2] };
  return null;
};

export const isBunnyStreamUrl = (url: string): boolean =>
  /(?:player|iframe)\.mediadelivery\.net\/embed\//i.test(url);

const BunnyStreamPlayer = memo(({
  url,
  title,
  onEnded,
  onReady,
}: BunnyStreamPlayerProps) => {
  const isPortrait = useOrientation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [videoEnded, setVideoEnded] = useState(false);
  // S2 — track Bunny iframe play state via postMessage so the YouTube-style
  // status-bar auto-hide (`useVideoStatusBarHide`) fires on landscape APK.
  const [isPlaying, setIsPlaying] = useState(false);
  useVideoStatusBarHide({ isPlaying, delayMs: 3000 });

  const parsed = parseBunnyStreamUrl(url);

  const embedUrl = parsed
    ? `https://player.mediadelivery.net/embed/${parsed.libraryId}/${parsed.videoId}` +
      `?autoplay=false&loop=false&muted=false&preload=true&responsive=true` +
      `&playbackRates=0.25,0.5,0.75,1,1.25,1.5,1.75,2,3` +
      `&showHeatmap=false&captions=en`
    : url;

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (typeof e.data !== "object" || !e.data) return;
      const { event } = e.data;
      switch (event) {
        case "ready":
          setLoading(false);
          onReady?.();
          break;
        case "videoEnded":
        case "ended":
          setVideoEnded(true);
          setIsPlaying(false);
          onEnded?.();
          break;
        case "play":
        case "playing":
          setVideoEnded(false);
          setIsPlaying(true);
          break;
        case "pause":
        case "paused":
          setIsPlaying(false);
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onEnded, onReady]);

  const handleLoad = useCallback(() => {
    setLoading(false);
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const prevent = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    c.addEventListener("contextmenu", prevent, { capture: true });
    c.addEventListener("copy", prevent, { capture: true });
    c.addEventListener("dragstart", prevent, { capture: true });
    return () => {
      c.removeEventListener("contextmenu", prevent);
      c.removeEventListener("copy", prevent);
      c.removeEventListener("dragstart", prevent);
    };
  }, []);

  // Reconcile body.overflow with Bunny's own iframe fullscreen — prevents
  // a locked viewport / blank screen if Bunny exits fullscreen unexpectedly.
  useEffect(() => {
    const onChange = () => {
      const real = !!document.fullscreenElement;
      document.body.style.overflow = real ? "hidden" : "";
      // Hardware-back sentinel: push on enter so useAndroidBackButton
      // pops us via popstate; pop on exit so history stays balanced.
      try {
        if (real && !window.history.state?.playerFullscreen) {
          window.history.pushState({ playerFullscreen: true }, "");
        } else if (!real && window.history.state?.playerFullscreen) {
          window.history.back();
        }
      } catch { /* noop */ }
    };
    const onPop = () => {
      if (document.fullscreenElement) {
        try { document.exitFullscreen?.(); } catch { /* noop */ }
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = "";
    };
  }, []);

  // Battery / data saver: pause the Bunny iframe when the tab is hidden
  // (lock-screen, app backgrounded, switched tab). Bunny's postMessage API
  // accepts {event:'pause'} from the parent window.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage({ event: "pause" }, "*");
        } catch { /* cross-origin guard — safe to ignore */ }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // PERF fix (audit MED): on unmount, blank the iframe src so the mediadelivery
  // connection + decoded video buffers release immediately. Without this the
  // WebView keeps ~40 MB per lesson until GC fires, causing memory pressure
  // after a few lesson swaps on low-RAM Android devices.
  useEffect(() => {
    const el = iframeRef.current;
    return () => {
      try { if (el) el.src = "about:blank"; } catch { /* noop */ }
      // Defensive: if a rotation-triggered unmount left a stale
      // `playerFullscreen` sentinel in history, clear it in place so the
      // next hardware-back press doesn't consume an invisible entry.
      // See audit Batch 1 Now #2 — `replaceState` is safer than `history.back`.
      try {
        if (typeof window !== "undefined" && window.history.state?.playerFullscreen) {
          window.history.replaceState(null, "");
        }
      } catch { /* noop */ }
    };
  }, []);


  return (
    <div
      ref={containerRef}
      className="bunny-ghost-player relative overflow-hidden bg-black select-none rounded-xl"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: "none" }}
    >
      <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-40 pointer-events-none">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={embedUrl}
          loading="eager"
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          // Legacy vendor attributes — some Android WebView versions still gate
          // on these for iframe fullscreen to actually paint.
          webkitallowfullscreen="true"
          mozallowfullscreen="true"
          title={title || "Video Player"}
          onLoad={handleLoad}
        />
      </div>

      {videoEnded && (
        <div className="absolute z-[52] pointer-events-none select-none bottom-3 left-3 animate-in fade-in duration-500">
          <img src={nbLogo} alt="NB"
            className="rounded-full shadow-lg"
            style={{ height: isPortrait ? "28px" : "32px", width: isPortrait ? "28px" : "32px", opacity: 0.85 }}
            draggable={false} />
        </div>
      )}
    </div>
  );
});

BunnyStreamPlayer.displayName = "BunnyStreamPlayer";

export default BunnyStreamPlayer;
