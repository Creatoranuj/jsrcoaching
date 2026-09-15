/**
 * Shared, side-effect-free pieces of the autoscroll "pause on pages" (dwell)
 * and route engines.
 *
 * The React loop (`useAutoScroll`) and the pdf.js bridge
 * (`public/pdfjs/web/nb-bridge.js`) both run this algorithm. This module is
 * the source of truth for the *rules* (clamps, matching, crossing detection);
 * the bridge mirrors them in plain JS because it is loaded as a static asset
 * inside the viewer document.
 */

/**
 * Which page boundaries trigger the timed pause in repeat mode.
 *
 * `"shuffle"` is a *generated* route: the FSRS scheduler
 * (`fsrsScheduler.ts`) produces the waypoint list and stores it in
 * `route`, so it reuses the route engine end to end.
 */
export type DwellParity = "odd" | "even" | "all" | "custom" | "route" | "shuffle";


export interface DwellSettings {
  enabled: boolean;
  parity: DwellParity;
  /** Pause duration at each matching page boundary, in seconds. */
  seconds: number;
  /** Explicit page numbers used when `parity === "custom"` (sorted, unique). */
  pages: number[];
  /**
   * Ordered waypoints used when `parity === "route"`. Order is preserved and
   * duplicates are kept — the engine flips direction per leg (6 → 3 → 8 → 2).
   */
  route: number[];
  /** Restart the route from the first waypoint after the last one. */
  loopRoute: boolean;
  /**
   * "A4 Sheet" mode: pages taller than the viewport are read screenful by
   * screenful — the engine pauses at each screen-sized slice of the page
   * before moving on. Off = classic behaviour (pause at the page top only).
   */
  a4: boolean;
  /**
   * Inclusive page range the Shuffle deck is limited to. `0` on either side
   * means "whole document".
   */
  shuffleFrom: number;
  shuffleTo: number;
}



/** Dwell duration bounds — must match `nb-bridge.js`. */
export const DWELL_MIN_SECONDS = 1;
export const DWELL_MAX_SECONDS = 3600;

/**
 * Non-linear ladder backing the "Pause for" slider: 1s granularity at the low
 * end (where a second matters), minutes in the middle, up to 1h at the top.
 * A plain linear range across 1..3600 would make every useful short value
 * land within two pixels of each other.
 */
export const DWELL_SLIDER_STEPS: number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  12, 15, 20, 25, 30, 40, 45, 50, 60,
  90, 120, 150, 180, 240, 300, 420, 600,
  900, 1200, 1800, 2400, 3000, 3600,
];

/** Nearest ladder index for a stored dwell value (slider position). */
export const dwellStepIndex = (seconds: number): number => {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < DWELL_SLIDER_STEPS.length; i++) {
    const diff = Math.abs(DWELL_SLIDER_STEPS[i] - seconds);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
};

/** Largest page number a student can meaningfully type. */
export const MAX_PAGE_NUMBER = 100000;
/**
 * Hard cap on how many pages a list may hold. The list is scanned inside the
 * per-frame dwell loop, so an unbounded paste would tax every animation frame.
 */
export const MAX_LIST_LENGTH = 500;

export const DEFAULT_DWELL: DwellSettings = {
  enabled: false,
  parity: "odd",
  seconds: 30,
  pages: [],
  route: [],
  loopRoute: false,
  a4: false,
  shuffleFrom: 0,
  shuffleTo: 0,
};



export const clampDwellSeconds = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v)
    ? Math.max(DWELL_MIN_SECONDS, Math.min(DWELL_MAX_SECONDS, Math.round(v)))
    : DEFAULT_DWELL.seconds;
};

const isPage = (n: number) => Number.isFinite(n) && n > 0 && n < MAX_PAGE_NUMBER;

/**
 * Parses a free-form page list ("1, 5, 3 2;8") into a sorted, unique list of
 * positive page numbers. Invalid tokens are ignored so typing never throws.
 */
export const parsePageList = (raw: string): number[] => {
  const out = new Set<number>();
  for (const token of String(raw ?? "").split(/[^0-9]+/)) {
    if (!token) continue;
    const n = parseInt(token, 10);
    if (isPage(n)) out.add(n);
    if (out.size >= MAX_LIST_LENGTH) break;
  }
  return Array.from(out).sort((a, b) => a - b);
};

/**
 * Parses an ordered route ("6, 3, 8, 2") — order preserved, duplicates kept.
 * Only consecutive duplicates are collapsed (they'd be a no-op leg).
 */
export const parseRouteList = (raw: string): number[] => {
  const out: number[] = [];
  for (const token of String(raw ?? "").split(/[^0-9]+/)) {
    if (!token) continue;
    const n = parseInt(token, 10);
    if (!isPage(n)) continue;
    if (out.length && out[out.length - 1] === n) continue;
    out.push(n);
    if (out.length >= MAX_LIST_LENGTH) break;
  }
  return out;
};

const normalizeParity = (p: unknown): DwellParity =>
  p === "even" || p === "all" || p === "custom" || p === "route" || p === "shuffle" ? p : "odd";

const normalizePages = (v: unknown): number[] =>
  Array.isArray(v)
    ? Array.from(new Set(v.map(Number).filter(isPage)))
        .sort((a, b) => a - b)
        .slice(0, MAX_LIST_LENGTH)
    : [];

const normalizeRoute = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(Number).filter(isPage).slice(0, MAX_LIST_LENGTH) : [];

/** `0` means "unbounded"; anything else is clamped to a real page number. */
const normalizeBound = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PAGE_NUMBER) : 0;
};

/** Coerces any untrusted shape (localStorage, postMessage) into safe settings. */
export const normalizeDwell = (v: Partial<DwellSettings> | null | undefined): DwellSettings => ({
  enabled: !!v?.enabled,
  parity: normalizeParity(v?.parity),
  seconds: clampDwellSeconds(v?.seconds),
  pages: normalizePages(v?.pages),
  route: normalizeRoute(v?.route),
  loopRoute: !!v?.loopRoute,
  a4: !!v?.a4,
  shuffleFrom: normalizeBound(v?.shuffleFrom),
  shuffleTo: normalizeBound(v?.shuffleTo),
});



/** Parses persisted dwell JSON; `null` when absent or malformed. */
export const parseDwell = (raw: string | null | undefined): DwellSettings | null => {
  if (!raw) return null;
  try {
    return normalizeDwell(JSON.parse(raw) as Partial<DwellSettings>);
  } catch {
    return null;
  }
};

/** Does this page number match the configured pause rule? */
export const matchesParity = (cfg: DwellSettings, page: number): boolean => {
  if (cfg.parity === "all") return true;
  if (cfg.parity === "custom") return cfg.pages.includes(page);
  if (cfg.parity === "route" || cfg.parity === "shuffle") return cfg.route.includes(page);
  return cfg.parity === "odd" ? page % 2 === 1 : page % 2 === 0;
};

/**
 * Route mode is only live when enabled, timed, and given at least one stop.
 * Shuffle rides the same engine — its waypoints are generated by the FSRS
 * scheduler and written into `route`.
 */
export const isRouteMode = (cfg: DwellSettings): boolean =>
  cfg.enabled &&
  cfg.seconds > 0 &&
  (cfg.parity === "route" || cfg.parity === "shuffle") &&
  cfg.route.length > 0;


/** A waypoint counts as reached once the step crossed or landed within 1px. */
export const waypointReached = (prevPos: number, pos: number, target: number): boolean =>
  (prevPos - target) * (pos - target) <= 0 || Math.abs(pos - target) < 1;

/**
 * The page boundary crossed by a step from `prevPos` to `pos`, or `undefined`.
 * Travelling up parks on the *last* boundary passed, down on the first.
 */
export function crossedBoundary(
  tops: { page: number; top: number }[],
  prevPos: number,
  pos: number,
  dir: number,
  cfg: DwellSettings
): { page: number; top: number } | undefined {
  const lo = Math.min(prevPos, pos);
  const hi = Math.max(prevPos, pos);
  const hits = tops.filter(
    (p) => p.top > lo + 0.001 && p.top <= hi + 0.001 && matchesParity(cfg, p.page)
  );
  return dir < 0 ? hits[hits.length - 1] : hits[0];
}

// ── A4 Sheet mode ────────────────────────────────────────────────────────
/**
 * Fraction of the viewport kept visible between two consecutive screenful
 * stops, so a line of text is never cut exactly at the seam.
 */
export const A4_STOP_OVERLAP = 0.08;

/** A measured page in the scroller's content coordinate space. */
export interface PageBox {
  page: number;
  top: number;
  /** Rendered page height in px. 0 / unknown falls back to a single stop. */
  height: number;
}

/** One place the engine parks on: a page, plus which slice of it. */
export interface DwellTarget {
  page: number;
  top: number;
  /** Slice index inside the page (0 = page top). */
  index: number;
  /** Stable identity used as the "already paused here" guard. */
  key: string;
}

/**
 * Screenful stop offsets for one page, ascending, starting at the page top.
 * A page that already fits the viewport yields a single stop (classic
 * behaviour), so turning A4 mode on never changes short/landscape slides.
 */
export function pageStops(
  pageTop: number,
  pageHeight: number,
  viewportHeight: number
): number[] {
  const h = Number(pageHeight) || 0;
  const vh = Number(viewportHeight) || 0;
  if (!(h > 0) || !(vh > 0) || h <= vh + 4) return [pageTop];
  const step = Math.max(40, vh * (1 - A4_STOP_OVERLAP));
  const lastOffset = h - vh;
  const out: number[] = [];
  for (let o = 0; o < lastOffset - 1; o += step) out.push(pageTop + o);
  out.push(pageTop + lastOffset);
  return out;
}

/**
 * Every position the dwell engine should pause at, ascending. Without A4 mode
 * this is exactly the matching page tops (one target per page).
 */
export function dwellTargets(
  boxes: PageBox[],
  cfg: DwellSettings,
  viewportHeight: number
): DwellTarget[] {
  const out: DwellTarget[] = [];
  for (const box of boxes) {
    if (!matchesParity(cfg, box.page)) continue;
    if (!cfg.a4) {
      out.push({ page: box.page, top: box.top, index: 0, key: `${box.page}:0` });
      continue;
    }
    pageStops(box.top, box.height, viewportHeight).forEach((top, index) => {
      out.push({ page: box.page, top, index, key: `${box.page}:${index}` });
    });
  }
  return out.sort((a, b) => a.top - b.top);
}

/**
 * The target crossed by a step from `prevPos` to `pos`, or `undefined`.
 * Travelling up parks on the *last* target passed, down on the first.
 */
export function crossedTarget(
  targets: DwellTarget[],
  prevPos: number,
  pos: number,
  dir: number
): DwellTarget | undefined {
  const lo = Math.min(prevPos, pos);
  const hi = Math.max(prevPos, pos);
  const hits = targets.filter((t) => t.top > lo + 0.001 && t.top <= hi + 0.001);
  return dir < 0 ? hits[hits.length - 1] : hits[0];
}
