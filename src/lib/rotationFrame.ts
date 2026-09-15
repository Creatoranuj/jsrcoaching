/**
 * Pseudo-landscape rotation frame.
 *
 * When the browser refuses `screen.orientation.lock('landscape')` we rotate the
 * reader ourselves. The transform MUST be applied to a frame that contains the
 * whole reader chrome (header + PDF surface + FABs + page chip) — rotating only
 * the PDF surface leaves the header and buttons upright while the page lies
 * sideways, which is what users reported.
 *
 * A CSS transform also establishes a containing block, so `position: fixed`
 * children (autoscroll FAB, page pill) anchor to the rotated frame instead of
 * the viewport — that is exactly what we want here.
 */
import type { CSSProperties } from "react";

/** Attribute the reader marks on the rotated frame so portals can target it. */
export const ROTATION_FRAME_ATTR = "data-reader-portal-host";

/** Event fired when the rotation frame appears/disappears (portal re-target). */
export const ROTATION_FRAME_EVENT = "reader-portal-host-change";

/**
 * Style for the frame element.
 *
 * Not rotated → `null` (caller keeps its normal flex layout untouched).
 * Rotated → absolutely positioned, sized to the swapped viewport axes, and
 * rotated about its top-left corner. Safe-area insets are swapped too: with the
 * frame turned 90° clockwise the physical notch sits along the left edge.
 */
export function rotationFrameStyle(pseudoLandscape: boolean): CSSProperties | undefined {
  if (!pseudoLandscape) return undefined;
  return {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100dvh",
    height: "100dvw",
    transformOrigin: "top left",
    transform: "rotate(90deg) translateY(-100%)",
    // Notch moves to the left edge once the frame is rotated.
    paddingLeft: "env(safe-area-inset-top, 0px)",
    paddingRight: "env(safe-area-inset-bottom, 0px)",
  };
}

/**
 * Resolve the portal host for floating reader UI.
 *
 * Priority: rotation frame (so FABs rotate with the page) → fullscreen element
 * (elements portalled to <body> are not painted while another element is in the
 * fullscreen top layer) → <body>.
 */
export function resolveReaderPortalHost(doc: Document | undefined = typeof document === "undefined" ? undefined : document): HTMLElement | null {
  if (!doc) return null;
  const frame = doc.querySelector(`[${ROTATION_FRAME_ATTR}]`) as HTMLElement | null;
  if (frame) return frame;
  const fs =
    (doc.fullscreenElement as HTMLElement | null) ??
    ((doc as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement as HTMLElement | null) ??
    null;
  return fs ?? doc.body;
}

/** Tell mounted portals to re-resolve their host. */
export function notifyPortalHostChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(ROTATION_FRAME_EVENT));
  } catch {
    /* ignore */
  }
}
