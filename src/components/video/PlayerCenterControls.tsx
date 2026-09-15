import { Play, Pause } from "lucide-react";
import { cn } from "../../lib/utils";
import playButtonIcon from "../../assets/icons/play-button.svg";
import { SkipIcon } from "./SkipIcon";

interface PlayerCenterControlsProps {
  showControls: boolean;
  isPlaying: boolean;
  isLandscapeRotation: boolean;
  isFakeFullscreen: boolean;
  isPortrait: boolean;
  onTogglePlay: () => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onShowControls: (ms?: number) => void;
}

export function PlayerCenterControls({
  showControls,
  isPlaying,
  isLandscapeRotation,
  isFakeFullscreen,
  isPortrait,
  onTogglePlay,
  onSkipBackward,
  onSkipForward,
  onShowControls,
}: PlayerCenterControlsProps) {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center px-4 md:px-6">
      <div
        className="relative h-full w-full"
        style={{
          width: isFakeFullscreen || isLandscapeRotation ? "min(80%, 42rem)" : "min(76%, 28rem)",
          transform: undefined,
        }}
      >
        {/* Skip back 10s — left thumb zone */}
        <button
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center bg-transparent border-none min-w-[72px] min-h-[72px]",
            "transition-transform duration-200 active:scale-90",
            showControls
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-90 pointer-events-none"
          )}
          data-player-control="true"
          onClick={(e) => {
            e.stopPropagation();
            onSkipBackward();
            onShowControls();
          }}
          title="Backward 10s"
          aria-label="Backward 10s"
        >
          <SkipIcon
            direction="back"
            className={cn(
              "w-10 h-10 md:w-11 md:h-11",
              (isLandscapeRotation || !isPortrait) && "w-12 h-12 md:w-14 md:h-14"
            )}
            style={{ filter: "drop-shadow(0px 4px 12px rgba(0,0,0,0.9))" }}
          />
        </button>

        {/* Play / Pause — dead center */}
        <button
          className={cn(
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center bg-transparent border-none min-w-[112px] min-h-[112px] md:min-w-[128px] md:min-h-[128px] rounded-full",
            "transition-transform duration-200 active:scale-90",
            "[touch-action:manipulation] [-webkit-tap-highlight-color:transparent]",
            showControls
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-90 pointer-events-none"
          )}
          data-player-control="true"
          onTouchEnd={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onTogglePlay();
            onShowControls(5000);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay();
            onShowControls(5000);
          }}
          title="Play/Pause"
          aria-label="Play/Pause"
        >
          {isPlaying ? (
            <Pause
              className="w-14 h-14 md:w-16 md:h-16 text-white"
              fill="white"
              style={{ filter: "drop-shadow(0px 4px 12px rgba(0,0,0,0.9))" }}
            />
          ) : (
            <img
              src={playButtonIcon}
              alt="Play/Pause"
              className="w-16 h-16 md:w-20 md:h-20"
              style={{ filter: "drop-shadow(0px 4px 12px rgba(0,0,0,0.9))" }}
            />
          )}
        </button>

        {/* Skip forward 10s — right thumb zone */}
        <button
          className={cn(
            "absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center bg-transparent border-none min-w-[72px] min-h-[72px]",
            "transition-transform duration-200 active:scale-90",
            showControls
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-90 pointer-events-none"
          )}
          data-player-control="true"
          onClick={(e) => {
            e.stopPropagation();
            onSkipForward();
            onShowControls();
          }}
          title="Forward 10s"
          aria-label="Forward 10s"
        >
          <SkipIcon
            direction="forward"
            className={cn(
              "w-10 h-10 md:w-11 md:h-11",
              (isLandscapeRotation || !isPortrait) && "w-12 h-12 md:w-14 md:h-14"
            )}
            style={{ filter: "drop-shadow(0px 4px 12px rgba(0,0,0,0.9))" }}
          />
        </button>
      </div>
    </div>
  );
}
