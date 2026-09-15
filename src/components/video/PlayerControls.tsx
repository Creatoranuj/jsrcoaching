import { ChevronLeft, Pause, Play } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PlayerIcon from "./PlayerIcon";

interface Props {
  title: string;
  isPlaying: boolean;
  isFullscreen: boolean;
  currentTime: number;
  duration: number;
  buffered: number; // 0..1
  speed: number;
  availableSpeeds: number[];
  quality: string;
  availableQualities: string[];
  visible: boolean;
  onBack?: () => void;
  onPlayPause: () => void;
  onSeek: (sec: number) => void;
  onSpeedChange: (s: number) => void;
  onQualityChange: (q: string) => void;
  onToggleFullscreen: () => void;
}

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const QUALITY_LABEL: Record<string, string> = {
  auto: "Auto",
  highres: "4K+",
  hd2160: "2160p",
  hd1440: "1440p",
  hd1080: "1080p",
  hd720: "720p",
  large: "480p",
  medium: "360p",
  small: "240p",
  tiny: "144p",
};

export default function PlayerControls(props: Props) {
  const {
    title,
    isPlaying,
    isFullscreen,
    currentTime,
    duration,
    buffered,
    speed,
    availableSpeeds,
    quality,
    availableQualities,
    visible,
    onBack,
    onPlayPause,
    onSeek,
    onSpeedChange,
    onQualityChange,
    onToggleFullscreen,
  } = props;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufPct = Math.max(0, Math.min(1, buffered)) * 100;

  return (
    <div
      className={cn(
        // Faster fade (0.12s) -> tap-toggle feels instant on Android WebView.
        "absolute inset-0 z-30 flex flex-col justify-between pointer-events-none transition-opacity duration-150 ease-out will-change-[opacity]",
        visible ? "opacity-100" : "opacity-0"
      )}
      aria-hidden={!visible}
    >
      {/* Top bar */}
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 px-3 py-2",
          "bg-gradient-to-b from-black/70 to-transparent text-white"
        )}
      >
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 h-11 w-11"
            onClick={onBack}
            aria-label="Back"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        )}
        <p className="flex-1 truncate text-sm font-medium drop-shadow">
          {title}
        </p>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 h-12 w-12"
              aria-label="Playback settings"
            >
              <PlayerIcon kind="settings" className="h-6 w-6" alt="Playback settings" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-zinc-900 border-zinc-800 text-white">
            <div className="space-y-6 pt-2">
              <section>
                <h3 className="text-xs uppercase tracking-wide text-zinc-400 mb-2">
                  Speed
                </h3>
                <div className="grid grid-cols-5 gap-2">
                  {availableSpeeds.map((s) => (
                    <button
                      key={s}
                      onClick={() => onSpeedChange(s)}
                      className={cn(
                        "rounded-md py-2 text-sm font-medium border min-h-11",
                        s === speed
                          ? "bg-white text-black border-white"
                          : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                      )}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="text-xs uppercase tracking-wide text-zinc-400 mb-2">
                  Quality
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {availableQualities.map((q) => (
                    <button
                      key={q}
                      onClick={() => onQualityChange(q)}
                      className={cn(
                        "rounded-md py-2 text-sm font-medium border min-h-11",
                        q === quality
                          ? "bg-white text-black border-white"
                          : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                      )}
                    >
                      {QUALITY_LABEL[q] ?? q}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Spacer for centre tap → handled by parent */}
      <div className="flex-1" />

      {/* Bottom bar */}
      <div className="pointer-events-auto bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-6 text-white">
        {/* Seek bar */}
        <div className="relative h-9 flex items-center" aria-label="Seek bar">
          <div className="absolute left-0 right-0 h-1 rounded-full bg-white/20 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-white/30"
              style={{ width: `${bufPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-red-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={0.1}
            value={Math.min(currentTime, duration)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer touch-none"
            aria-label="Seek"
          />
        </div>

        <div className="mt-1 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 h-14 w-14"
            onClick={onPlayPause}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
          </Button>
          <span className="text-xs tabular-nums text-white/90">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
          <div className="flex-1" />
          <span className="text-xs text-white/70">{speed}x</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 h-11 w-11"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <PlayerIcon
              kind="rotate"
              className={cn("h-6 w-6 transition-transform", isFullscreen && "rotate-90")}
              alt={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            />
          </Button>
        </div>
      </div>
    </div>
  );
}
