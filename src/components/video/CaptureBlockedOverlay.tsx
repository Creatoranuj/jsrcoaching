import { ShieldAlert } from "lucide-react";

/**
 * Shown on iOS when active screen recording is detected.
 * Black scrim hides video; recording still happens at OS level but captures
 * only this overlay. Companion to `useScreenCaptureDetection`.
 */
export default function CaptureBlockedOverlay() {
  return (
    <div className="absolute inset-0 z-40 bg-black flex items-center justify-center p-6 text-white text-center">
      <div className="max-w-xs space-y-3">
        <ShieldAlert className="h-10 w-10 mx-auto text-red-400" />
        <h2 className="text-base font-semibold">Recording detected</h2>
        <p className="text-sm text-white/70">
          Playback is paused while your screen is being recorded. Stop the
          recording to continue watching this lecture.
        </p>
      </div>
    </div>
  );
}
