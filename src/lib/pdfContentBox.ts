/**
 * Content-aware fit for sparse PDF pages.
 *
 * Google Sheets / Docs "export to PDF" produces full A4 sheets where the real
 * table occupies a small block in the top-left corner. Fitting the *paper* to
 * a phone screen shrinks that table to an unreadable sliver surrounded by
 * white. These helpers measure the ink bounding box and fit that instead.
 *
 * `fitToContent` is pure and unit-tested; `measureContentBox` touches pdf.js.
 */

export interface ContentBox {
  /** Left edge in viewport(scale=1) pixels, top-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageSize {
  width: number;
  height: number;
}

export interface ContentFit {
  /** Width to pass to react-pdf <Page width> (full page width, scaled). */
  renderWidth: number;
  /** Visible crop rectangle in CSS px. */
  cropWidth: number;
  cropHeight: number;
  /** Translate applied to the rendered page inside the crop window. */
  offsetX: number;
  offsetY: number;
  /** Page has no ink at all — collapse it. */
  blank: boolean;
}

/** Content must cover less than this fraction of the page to be cropped. */
const COVERAGE_THRESHOLD = 0.75;
/** Never magnify beyond this, so a stray glyph can't explode the page. */
const MAX_ZOOM = 3;
/** Breathing room around the content box, as a fraction of page width. */
const PAD_RATIO = 0.02;

/**
 * Decide how to render a page given its ink bounding box.
 * Returns `null` when the page should render exactly as before.
 */
export function fitToContent(
  box: ContentBox | null,
  page: PageSize,
  containerWidth: number
): ContentFit | null {
  if (!box || !page.width || !page.height || containerWidth <= 0) return null;

  if (box.width <= 2 || box.height <= 2) {
    return { renderWidth: containerWidth, cropWidth: containerWidth, cropHeight: 0, offsetX: 0, offsetY: 0, blank: true };
  }

  const coverW = box.width / page.width;
  const coverH = box.height / page.height;
  if (coverW >= COVERAGE_THRESHOLD && coverH >= COVERAGE_THRESHOLD) return null;

  const pad = page.width * PAD_RATIO;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(page.width - x, box.width + pad * 2);
  const h = Math.min(page.height - y, box.height + pad * 2);
  if (w <= 0 || h <= 0) return null;

  const scale = Math.min(MAX_ZOOM, Math.max(1, containerWidth / w));
  const renderWidth = Math.round(page.width * scale);
  const cropWidth = Math.min(containerWidth, Math.round(w * scale));
  const cropHeight = Math.round(h * scale);

  return {
    renderWidth,
    cropWidth,
    cropHeight,
    offsetX: Math.round(x * scale),
    offsetY: Math.round(y * scale),
    blank: false,
  };
}

type AnyPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  getTextContent?: () => Promise<{ items: unknown[] }>;
  getOperatorList?: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
};

/**
 * Union bounding box of text runs on a page, in viewport(scale=1) pixels with
 * a top-left origin. Returns null when measurement isn't possible.
 */
export async function measureContentBox(page: AnyPage): Promise<ContentBox | null> {
  try {
    const vp = page.getViewport({ scale: 1 });
    if (!page.getTextContent) return null;
    const text = await page.getTextContent();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const raw of text.items) {
      const item = raw as { transform?: number[]; width?: number; height?: number; str?: string };
      if (!item.transform || (item.str !== undefined && item.str.trim() === "")) continue;
      const [, , , , tx, ty] = item.transform;
      const w = item.width ?? 0;
      const h = item.height ?? 0;
      // PDF space has a bottom-left origin; flip to top-left viewport space.
      const left = tx;
      const right = tx + w;
      const top = vp.height - (ty + h);
      const bottom = vp.height - ty;
      if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, bottom);
    }

    // No text at all (scanned / image-only page). We cannot tell where the ink
    // is, so report "unknown" and let the page render normally. Returning a
    // zero box here would collapse every scanned page to a blank divider.
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    const x = Math.max(0, minX);
    const y = Math.max(0, minY);
    return {
      x,
      y,
      width: Math.min(vp.width - x, maxX - minX),
      height: Math.min(vp.height - y, maxY - minY),
    };
  } catch {
    return null;
  }
}

/**
 * Ink bounding box measured from a low-resolution raster of the page.
 *
 * `measureContentBox` above only sees *text* runs, so scanned / image-only
 * lecture pages (the common case in this app) always reported "unknown" and
 * kept their printed white paper margins — which is what shows up as white
 * strips on the left and right of the phone screen. Rasterising the page once
 * at ~120px wide is cheap (a few ms) and finds ink regardless of how it was
 * drawn.
 */
export async function measureInkBox(
  page: AnyPage & { render?: (o: Record<string, unknown>) => { promise: Promise<void> } },
  sampleWidth = 120,
): Promise<ContentBox | null> {
  try {
    if (typeof document === "undefined" || !page.render) return null;
    const vp1 = page.getViewport({ scale: 1 });
    if (!vp1.width || !vp1.height) return null;
    const scale = Math.min(1, sampleWidth / vp1.width);
    const vp = page.getViewport({ scale });
    const w = Math.max(1, Math.round(vp.width));
    const h = Math.max(1, Math.round(vp.height));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // Paper white, so an un-painted pixel counts as margin either way.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const { data } = ctx.getImageData(0, 0, w, h);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = data[i + 3];
        // Near-white (or transparent) is treated as blank paper.
        const light = data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244;
        if (a < 8 || light) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    const k = 1 / scale;
    const x = Math.max(0, minX * k);
    const y = Math.max(0, minY * k);
    return {
      x,
      y,
      width: Math.min(vp1.width - x, (maxX - minX + 1) * k),
      height: Math.min(vp1.height - y, (maxY - minY + 1) * k),
    };
  } catch {
    return null;
  }
}

/** Trim only side margins: keeps full page height, crops left/right whitespace. */
const MARGIN_MAX_ZOOM = 1.6;
/** Ignore trims smaller than this fraction of the page width (not worth a reflow). */
const MARGIN_MIN_TRIM = 0.03;

export function fitToMargins(
  box: ContentBox | null,
  page: PageSize,
  containerWidth: number,
): ContentFit | null {
  if (!box || !page.width || !page.height || containerWidth <= 0) return null;
  if (box.width <= 2 || box.height <= 2) return null;

  const pad = page.width * 0.01;
  const x = Math.max(0, box.x - pad);
  const right = Math.min(page.width, box.x + box.width + pad);
  const w = right - x;
  if (w <= 0) return null;
  // Nothing meaningful to trim → render the page exactly as before.
  if ((page.width - w) / page.width < MARGIN_MIN_TRIM) return null;

  const scale = Math.min(MARGIN_MAX_ZOOM, Math.max(1, containerWidth / w));
  const renderWidth = Math.round(page.width * scale);
  const cropWidth = Math.min(containerWidth, Math.round(w * scale));
  const cropHeight = Math.round(page.height * scale);
  return {
    renderWidth,
    cropWidth,
    cropHeight,
    offsetX: Math.round(x * scale),
    offsetY: 0,
    blank: false,
  };
}
