/**
 * Compute the pixel width to render a PDF page at so it fits the mobile
 * viewport without horizontal clipping.
 *
 *  - Clamps to the visual viewport width (handles pinch-zoom on mobile).
 *  - Subtracts horizontal padding (`px-2` => 16px) so the canvas never overflows.
 *  - Caps at 1100px on desktop.
 *  - Floors at 240px so very narrow popups still render.
 *
 * Pure / side-effect free — covered by `src/test/pdf-system.test.ts` Suite 7.
 */
export function computeFitPageWidth(
  viewportWidth: number,
  containerWidth?: number,
  /** Horizontal breathing room to subtract. Readers that render edge-to-edge
   *  pass 0; the historical default keeps a 16px gutter. */
  gutter = 16
): number {
  const vp = Math.max(0, Math.floor(viewportWidth || 0));
  const cw = containerWidth && containerWidth > 0 ? Math.floor(containerWidth) : vp;
  const bounded = Math.min(cw, vp);
  const g = Number.isFinite(gutter) ? Math.max(0, Math.floor(gutter)) : 16;
  return Math.max(240, Math.min(bounded - g, 1100));
}

/**
 * Device-adaptive page sizing for the full-screen reader.
 *
 * Portrait  -> fit to width (the page fills the screen edge-to-edge).
 * Landscape -> also fits width by default, so a rotated phone shows no white
 *              strips on the sides; the reader scrolls vertically. Pass
 *              `wholePage: true` to keep the legacy height-bound fit where a
 *              whole page must stay visible at once.
 *
 * `pageRatio` is height / width of the PDF page (A4 portrait ~ 1.414).
 * Pure / side-effect free.
 */
export function computeFitPageSize({
  viewportWidth,
  viewportHeight,
  containerWidth,
  pageRatio,
  gutter = 0,
  minWidth = 240,
  wholePage = false,
}: {
  viewportWidth: number;
  viewportHeight: number;
  containerWidth?: number;
  pageRatio?: number;
  gutter?: number;
  minWidth?: number;
  /** Landscape only: cap the width so an entire page fits the height. */
  wholePage?: boolean;
}): number {
  const fitWidth = computeFitPageWidth(viewportWidth, containerWidth, gutter);
  const vh = Math.max(0, Math.floor(viewportHeight || 0));
  const ratio = Number.isFinite(pageRatio) && (pageRatio as number) > 0 ? (pageRatio as number) : 0;
  const isLandscape = viewportWidth > vh && vh > 0;
  if (!isLandscape || !ratio || !wholePage) return fitWidth;
  const heightFit = Math.floor(vh / ratio);
  return Math.max(minWidth, Math.min(fitWidth, heightFit));
}
