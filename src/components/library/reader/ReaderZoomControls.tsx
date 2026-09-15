import { Minus, Plus } from "lucide-react";
import { tapHaptic } from "../../../lib/native/haptics";

interface Props {
  zoom: number;
  visible: boolean;
  onZoomBy: (factor: number) => void;
  onFitWidth: () => void;
}

/**
 * Floating one-handed zoom controls for the reader.
 *
 * Pinch and double-tap still own the fast path; these buttons exist so zoom is
 * reachable with a thumb. Tapping the percentage resets to fit-width.
 */
export default function ReaderZoomControls({ zoom, visible, onZoomBy, onFitWidth }: Props) {
  return (
    <div
      className={`fixed left-1/2 z-40 -translate-x-1/2 transition-opacity duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 rounded-full border bg-card/95 px-1 py-1 shadow-lg backdrop-blur">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => { void tapHaptic("light"); onZoomBy(1 / 1.25); }}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground active:scale-[0.94]"
        >
          <Minus className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={`Zoom ${Math.round(zoom * 100)} percent — tap to fit width`}
          onClick={() => { void tapHaptic("light"); onFitWidth(); }}
          className="min-w-[56px] rounded-full px-2 py-2 text-sm font-semibold tabular-nums text-foreground active:scale-[0.94]"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => { void tapHaptic("light"); onZoomBy(1.25); }}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground active:scale-[0.94]"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
