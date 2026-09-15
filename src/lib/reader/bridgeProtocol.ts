/**
 * Typed contract for the parent ⇄ pdf.js-iframe bridge (`public/pdfjs/web/nb-bridge.js`).
 *
 * Every message string used to be a hand-typed literal in four different
 * files, so a typo silently killed a channel. Import the constants from here
 * instead. The mirror-side JSDoc typedefs live at the top of `nb-bridge.js`
 * and must be kept in sync with this file.
 */

/** Messages the parent sends *into* the reader iframe. */
export const ToBridge = {
  ping: "nb-autoscroll-ping",
  tick: "nb-autoscroll-tick",
  dwell: "nb-autoscroll-dwell",
  top: "nb-autoscroll-top",
  gotoPage: "nb-goto-page",
  scrollToFraction: "nb-scroll-to-fraction",
} as const;

/** Messages the reader iframe posts back to the parent. */
export const FromBridge = {
  pong: "nb-autoscroll-pong",
  state: "nb-autoscroll-state",
  dir: "nb-autoscroll-dir",
  dwelling: "nb-autoscroll-dwelling",
  routeDone: "nb-autoscroll-route-done",
  userActivity: "nb-autoscroll-user-activity",
  pageState: "nb-page-state",
  pdfReady: "nb-pdf-ready",
  pdfProgress: "nb-pdf-progress",
  pdfPagesLoaded: "nb-pdf-pagesloaded",
  pdfPageRendered: "nb-pdf-pagerendered",
  pdfError: "nb-pdf-error",
  pdfTimeout: "nb-pdf-timeout",
} as const;

export type ToBridgeType = (typeof ToBridge)[keyof typeof ToBridge];
export type FromBridgeType = (typeof FromBridge)[keyof typeof FromBridge];

export type BridgeMessage =
  | { type: typeof FromBridge.pong }
  | { type: typeof FromBridge.state; atEnd?: boolean; scrollTop?: number }
  | { type: typeof FromBridge.dir; dir?: number }
  | { type: typeof FromBridge.dwelling; page?: number; until?: number }
  | { type: typeof FromBridge.routeDone; page?: number }
  | { type: typeof FromBridge.userActivity }
  | { type: typeof FromBridge.pageState; first?: number; last?: number; total?: number }
  | { type: FromBridgeType; [key: string]: unknown };

/**
 * True when a `message` event genuinely came from the reader iframe we own.
 *
 * Without this any embedded frame or opener could post `nb-autoscroll-state`
 * and stop the engine, or drive fake page numbers. `origin === "null"` is
 * allowed because a blob/sandboxed viewer document reports an opaque origin.
 */
export function isTrustedBridgeMessage(
  e: MessageEvent,
  iframe: HTMLIFrameElement | null | undefined
): boolean {
  const src = iframe?.contentWindow ?? null;
  if (!src || e.source !== src) return false;
  if (e.origin !== "null" && e.origin !== window.location.origin) return false;
  const d = e.data;
  return !!d && typeof d === "object";
}

/** Best-effort post into the reader iframe; never throws on a torn-down frame. */
export function postToBridge(
  iframe: HTMLIFrameElement | null | undefined,
  message: { type: ToBridgeType } & Record<string, unknown>
): void {
  try {
    iframe?.contentWindow?.postMessage(message, "*");
  } catch {
    /* frame gone / cross-origin — best effort only */
  }
}
