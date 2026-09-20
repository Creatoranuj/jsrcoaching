import { useFullscreen } from "./useFullscreen";

/**
 * Hide the native status bar (and Android nav bar when `deep` is active)
 * while a full-screen reader/viewer is open.
 *
 * Thin wrapper over {@link useFullscreen} so readers share the same
 * reference-counted owner set as the video player — a video going fullscreen
 * inside an immersive reader no longer restores the reader's chrome when it
 * exits, and immersive mode is re-applied when the app returns from the
 * background.
 *
 * Restores chrome automatically on unmount so navigating away or closing the
 * reader never leaves the app chrome-less. Safe no-op on web / iOS.
 */
export function useReaderImmersive(active: boolean, deep = false) {
  useFullscreen(active, { deep });
}
