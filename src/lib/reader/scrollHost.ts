/**
 * Shared scroll-host resolution.
 *
 * The reader does NOT scroll the document: pages live inside an inner
 * container with `overflow-y: auto`. Anything that assumed
 * `document.scrollingElement` (autoscroll FAB, page pill, back-to-top) bound
 * to the wrong element there, so pause/resume and the "is anything
 * scrollable" guard silently no-op'd on some devices.
 *
 * `resolveScrollHost` walks up from a preferred element and returns the
 * nearest ancestor that actually scrolls, falling back to the document.
 */

/** Minimum overflow (px) before we treat an element as genuinely scrollable. */
const SLACK = 8;

export function isScrollable(el: Element | null | undefined): boolean {
  if (!el) return false;
  const node = el as HTMLElement;
  if (node.scrollHeight <= node.clientHeight + SLACK) return false;
  try {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    return oy === "auto" || oy === "scroll" || oy === "overlay";
  } catch {
    return false;
  }
}

/** The document-level scroller (html/body), which always accepts scrollTop. */
export function documentScrollHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (document.scrollingElement ?? document.documentElement) as HTMLElement | null;
}

function documentScrolls(): boolean {
  const doc = documentScrollHost();
  if (!doc) return false;
  const viewport = typeof window !== "undefined" ? window.innerHeight : doc.clientHeight;
  return doc.scrollHeight > viewport + SLACK;
}

export interface ResolveOptions {
  /** Start the walk here instead of at the reader/document root. */
  preferred?: Element | null;
  /** Return null (rather than the document) when nothing scrolls. */
  requireScrollable?: boolean;
}

/**
 * Nearest scrollable ancestor of `preferred`, else the deepest scrollable
 * reader container on the page, else the document scroller.
 */
export function resolveScrollHost(options: ResolveOptions = {}): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const { preferred, requireScrollable = false } = options;

  // 1) Walk up from the preferred node.
  let node: Element | null = preferred ?? null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (isScrollable(node)) return node as HTMLElement;
    node = node.parentElement;
  }

  // 2) Look for a marked reader surface (opt-in, cheap: one attribute query).
  const marked = document.querySelector<HTMLElement>("[data-scroll-host]");
  if (isScrollable(marked)) return marked;

  // 3) Document scroller.
  if (documentScrolls()) return documentScrollHost();
  return requireScrollable ? null : documentScrollHost();
}

/** Short human tag for the debug panel ("html", "div#reader", "main.pages"). */
export function describeScrollHost(el: HTMLElement | null): string {
  if (!el) return "none";
  const tag = el.tagName.toLowerCase();
  if (tag === "html" || tag === "body") return tag;
  const id = el.id ? `#${el.id}` : "";
  const cls = el.classList[0] ? `.${el.classList[0]}` : "";
  return `${tag}${id}${cls}`;
}
