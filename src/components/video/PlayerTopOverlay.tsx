import { ArrowLeft } from "lucide-react";
import { cn } from "../../lib/utils";

interface PlayerTopOverlayProps {
  showControls: boolean;
  isFakeFullscreen: boolean;
  title?: string;
  subtitle?: string;
  onExitFullscreen: () => void;
  onBackgroundClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function PlayerTopOverlay({
  showControls,
  isFakeFullscreen,
  title,
  subtitle,
  onExitFullscreen,
  onBackgroundClick,
}: PlayerTopOverlayProps) {
  return (
    <div
      // @ts-expect-error - `inert` is a valid HTML attribute; older React types may not include it.
      inert={showControls ? undefined : ""}
      className={cn(
        "absolute top-0 left-0 right-0 z-[55] flex items-start justify-between p-3 md:p-4",
        showControls
          ? "opacity-100 transition-opacity duration-100 ease-out motion-reduce:transition-none"
          : "opacity-0 pointer-events-none transition-opacity duration-75 ease-in motion-reduce:transition-none"
      )}
      style={
        isFakeFullscreen
          ? {
              paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
              paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
            }
          : undefined
      }
      onClick={onBackgroundClick}
    >
      {isFakeFullscreen ? (
        <button
          className="flex items-center justify-center bg-black/60 rounded-full p-2 mr-3 shrink-0 pointer-events-auto active:scale-90 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            onExitFullscreen();
          }}
          title="Exit fullscreen"
          aria-label="Exit fullscreen"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
      ) : null}
      <div className="flex-1 min-w-0">
        {title && (
          <h2 className="text-white text-sm md:text-base font-semibold line-clamp-1 drop-shadow-md">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-white/70 text-xs mt-0.5 drop-shadow">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
