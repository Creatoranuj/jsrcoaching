import { cn } from "../../lib/utils";
import SettingsGearIcon from "../icons/SettingsGearIcon";

interface PlayerSettingsMenuProps {
  showControls: boolean;
  showSpeedMenu: boolean;
  playbackSpeed: number;
  onToggleMenu: () => void;
  onSetSpeed: (speed: number) => void;
}

export function PlayerSettingsMenu({
  showControls,
  showSpeedMenu,
  playbackSpeed,
  onToggleMenu,
  onSetSpeed,
}: PlayerSettingsMenuProps) {
  if (!showControls) return null;

  return (
    <div className="relative z-10">
      <button
        className="h-12 w-12 md:h-13 md:w-13 flex items-center justify-center outline-none focus:outline-none pointer-events-auto active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-white/80 rounded-md"
        onClick={onToggleMenu}
        title="Playback speed"
        aria-label="Playback speed and quality"
        aria-haspopup="menu"
        aria-expanded={showSpeedMenu}
      >
        <SettingsGearIcon
          className="h-8 w-8 md:h-9 md:w-9 text-white pointer-events-none"
          style={{ filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.95))" }}
        />
      </button>
      {showSpeedMenu && (
        <div className="absolute bottom-full right-0 mb-2 bg-black/95 rounded-lg py-1 min-w-[88px] animate-in fade-in slide-in-from-bottom-2 duration-150 z-20">
          {[0.75, 1, 1.25, 1.5, 2, 3].map((speed) => (
            <button
              key={speed}
              className={cn(
                "w-full px-3 py-1.5 text-left text-sm hover:bg-white/20 transition-colors",
                playbackSpeed === speed ? "text-blue-400 font-semibold" : "text-white"
              )}
              onClick={() => onSetSpeed(speed)}
            >
              {speed}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
