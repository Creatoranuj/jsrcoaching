import { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { RotateCcw, ChevronRight, Play, X } from "lucide-react";
import nbLogo from "../../assets/branding/jsr-mark.webp";

interface EndScreenOverlayProps {
  onReplay: () => void;
  onNextVideo?: () => void;
  nextVideoTitle?: string;
  nextVideoDuration?: number;
}

const COUNTDOWN_START = 10;

const EndScreenOverlay = ({
  onReplay,
  onNextVideo,
  nextVideoTitle,
  nextVideoDuration,
}: EndScreenOverlayProps) => {
  const [countdown, setCountdown] = useState(onNextVideo ? COUNTDOWN_START : -1);
  const [cancelled, setCancelled] = useState(false);

  const handleCancel = useCallback(() => {
    setCancelled(true);
    setCountdown(-1);
  }, []);

  const handleStartNow = useCallback(() => {
    setCountdown(-1);
    onNextVideo?.();
  }, [onNextVideo]);

  useEffect(() => {
    if (cancelled || countdown <= 0 || !onNextVideo) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onNextVideo();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cancelled, onNextVideo, countdown]);

  const showCountdown = !cancelled && countdown > 0 && onNextVideo;

  return (
    <div
      className="mahima-end-screen absolute inset-0 flex flex-col items-center justify-center animate-in fade-in duration-300"
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.95)",
        pointerEvents: "auto",
      }}
    >
      {/* Logo */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-brand-accent/20 blur-2xl animate-pulse scale-150" />
        <img
          src={nbLogo}
          alt="JSR COACHING"
          className="relative h-16 w-16 rounded-2xl shadow-2xl"
          draggable={false}
        />
      </div>

      {showCountdown ? (
        <>
          {/* Countdown text */}
          <p className="text-white/60 text-sm mb-4">
            Next Lesson will start in{" "}
            <span className="text-white font-bold text-lg">{countdown}</span>{" "}
            seconds
          </p>

          {/* Next video info */}
          {nextVideoTitle && (
            <div className="flex items-center gap-3 bg-white/10 rounded-lg px-4 py-3 mb-6 max-w-xs">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Play className="h-5 w-5 text-primary fill-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {nextVideoTitle}
                </p>
                <p className="text-white/40 text-xs">
                  Video{nextVideoDuration ? ` • ${Math.round(nextVideoDuration / 60)} min` : ""}
                </p>
              </div>
            </div>
          )}

          {/* Countdown action buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={(e) => { e.stopPropagation(); handleCancel(); }}
              className="bg-transparent border-white/20 text-white hover:bg-white/10 gap-2"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={(e) => { e.stopPropagation(); handleStartNow(); }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2"
            >
              Start Now
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Post-cancel / no-next-video state */}
          <p className="text-white/60 text-sm mb-8">More lessons await you!</p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              size="lg"
              onClick={(e) => { e.stopPropagation(); onReplay(); }}
              className="bg-white text-black hover:bg-white/90 font-semibold px-8 gap-2"
            >
              <RotateCcw className="h-5 w-5" />
              Replay
            </Button>

            {onNextVideo && nextVideoTitle && (
              <Button
                size="lg"
                onClick={(e) => { e.stopPropagation(); onNextVideo(); }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 gap-2"
              >
                Next: {nextVideoTitle.length > 20 ? nextVideoTitle.slice(0, 20) + "..." : nextVideoTitle}
                <ChevronRight className="h-5 w-5" />
              </Button>
            )}
          </div>
        </>
      )}

      {/* Saffron accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-accent via-brand-accent-hover to-brand-accent" />
    </div>
  );
};

export default EndScreenOverlay;
