/**
 * DOM interop augmentations for vendor-prefixed fullscreen APIs and
 * app-specific debug hooks. Centralising these lets feature code drop
 * `as any` casts around legitimate but unstandardised DOM properties.
 *
 * Added: 2026-07-05 — senior-architect-audit cleanup PR.
 */

export {};

declare global {
  interface Window {
    /** FastPdfReader debug flag (set by DevTools/URL). */
    nb_pdf_debug?: boolean;
    /** SafeAreaDebugOverlay snapshot util — dev only. */
    __nbSnapshotSafeArea?: () => unknown;
  }

  interface Document {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
    mozFullScreenElement?: Element | null;
    mozCancelFullScreen?: () => Promise<void>;
    msFullscreenElement?: Element | null;
    msExitFullscreen?: () => Promise<void>;
  }

  interface HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  }

  interface DocumentEventMap {
    webkitfullscreenchange: Event;
    mozfullscreenchange: Event;
    MSFullscreenChange: Event;
  }

  namespace React {
    interface IframeHTMLAttributes<T> {
      webkitallowfullscreen?: string | boolean;
      mozallowfullscreen?: string | boolean;
    }
  }
}
