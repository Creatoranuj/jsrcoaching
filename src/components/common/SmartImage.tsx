import {
  forwardRef,
  type ImgHTMLAttributes,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type SyntheticEvent,
} from "react";

/**
 * SmartImage — resilient <img> replacement.
 *   1. Lazy + async decode (overridable via `priority`).
 *   2. Rewrites Supabase Storage URLs to the transform endpoint (WebP @ width).
 *      On 403/FeatureNotEnabled (Free tier), the module caches the flag and
 *      every subsequent image skips the transform.
 *   3. Retries the original URL up to `maxRetries` times with backoff before
 *      giving up. On final failure, swaps to `fallbackSrc` (default avatar
 *      / placeholder) so broken alt text NEVER bleeds into the UI — this
 *      was the "Mr Anuj Kumar Yadav" text-in-avatar bug on APK.
 *   4. Keeps <img> visually hidden until it decodes, so alt text can't flash
 *      during retries.
 *
 * Audit 2026-09-22 (P0 "course thumbnails never load"):
 *   The reveal logic depended on React's `onLoad`. Android WebView / Firefox
 *   can satisfy a memory-cached image *synchronously* while the element is
 *   being committed, and then never dispatch `load`. A layout-effect guard
 *   (`img.complete && naturalWidth > 0 → setLoaded(true)`) existed, but the
 *   unconditional reset effect below it (`setLoaded(false)` on `[src, width]`)
 *   ran *after* it on mount and undid the reveal, so the image stayed at
 *   `opacity: 0` behind the grey tile forever — exactly the "thumbnails not
 *   loading" symptom on second visits / in the APK. The reset now only runs
 *   when `src`/`width` genuinely change, the completion probe also treats a
 *   `complete && naturalWidth === 0` image as a failed load (lost `error`
 *   event), and a single delayed re-check catches a `load` that was lost
 *   after commit. A decoded image is never left invisible.
 */
export interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  src: string;
  width: number;
  height: number;
  priority?: boolean;
  /** Shown when every retry + original URL fails. */
  fallbackSrc?: string;
  /** Extra retries against the ORIGINAL url after the transform fails. Default 2. */
  maxRetries?: number;
  /** Base delay between retries in ms. Default 600. */
  retryDelay?: number;
}

const SUPABASE_PUBLIC_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;
const SUPABASE_RENDER_MARK = "/storage/v1/render/image/public/";
const DEFAULT_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23e5e7eb'/><circle cx='20' cy='16' r='7' fill='%239ca3af'/><path d='M6 36c2-8 8-12 14-12s12 4 14 12z' fill='%239ca3af'/></svg>`
  );

/**
 * How long after an attempt is committed we re-probe `img.complete`. Covers a
 * `load` event lost *after* commit (the layout-effect probe only sees images
 * that were already decoded at commit time). 1.5s is far below the 6s
 * storage-call ceiling, so a genuinely slow image is simply probed once and
 * left alone until its own `load` fires.
 */
const LOST_EVENT_RECHECK_MS = 1500;

// Supabase image transformations are a paid feature. On this project the
// /render/image endpoint returns 403 (FeatureNotEnabled), which caused every
// SmartImage to make one failed request before falling back to the raw src —
// producing a blank gray tile on first paint (visible on Courses cards).
// Default to DISABLED; flip to false only if we ever move to a paid tier.
let supabaseTransformsDisabled = true;

function toSupabaseRender(src: string, width: number): string {
  if (supabaseTransformsDisabled) return src;
  const m = src.match(SUPABASE_PUBLIC_RE);
  if (!m) return src;
  const [, bucket, objectPath] = m;
  const base = src.replace(
    SUPABASE_PUBLIC_RE,
    `/storage/v1/render/image/public/${bucket}/${objectPath}`
  );
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}width=${width}&quality=78&format=webp&resize=contain`;
}

function isRenderUrl(url: string): boolean {
  return url.includes(SUPABASE_RENDER_MARK);
}

export const SmartImage = forwardRef<HTMLImageElement, SmartImageProps>(
  (
    {
      src,
      width,
      height,
      priority = false,
      decoding = "async",
      onError,
      onLoad,
      fallbackSrc = DEFAULT_FALLBACK,
      maxRetries = 2,
      retryDelay = 600,
      style,
      ...rest
    },
    ref
  ) => {
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [attempt, setAttempt] = useState<string>(() => toSupabaseRender(src, width));
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const retriesRef = useRef(0);
    const timerRef = useRef<number | null>(null);
    const recheckTimerRef = useRef<number | null>(null);
    // Identity of the (src, width) pair the current attempt chain belongs to.
    // Lets the reset effect distinguish "mounted" from "props changed".
    const attemptKeyRef = useRef(`${width}|${src}`);

    const setRefs = useCallback(
      (node: HTMLImageElement | null) => {
        imgRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as MutableRefObject<HTMLImageElement | null>).current = node;
        }
      },
      [ref]
    );

    const clearTimers = useCallback(() => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (recheckTimerRef.current) {
        window.clearTimeout(recheckTimerRef.current);
        recheckTimerRef.current = null;
      }
    }, []);

    // Reset the retry chain ONLY when src/width actually change — never on
    // mount (see header comment: the mount-time reset used to clobber the
    // synchronous "already decoded" reveal below).
    useEffect(() => {
      const key = `${width}|${src}`;
      if (attemptKeyRef.current === key) return;
      attemptKeyRef.current = key;
      clearTimers();
      retriesRef.current = 0;
      setLoaded(false);
      setFailed(false);
      setAttempt(toSupabaseRender(src, width));
    }, [src, width, clearTimers]);

    useEffect(() => clearTimers, [clearTimers]);

    /**
     * Advance the fallback chain after a failed attempt. Shared by the DOM
     * `error` handler and the completion probe (which handles a lost `error`
     * event: `complete === true` with `naturalWidth === 0` means the browser
     * already gave up on this URL).
     */
    const advanceAfterFailure = useCallback(
      (e?: SyntheticEvent<HTMLImageElement, Event>) => {
        // Step 1: Supabase Storage render endpoint failed (403/FeatureNotEnabled
        // on Free tier) → cache the flag and fall back to the raw src. Guard
        // narrowly on the render URL so cache-bust retries (?_r=N) below don't
        // mis-trigger this branch and clobber the retry counter.
        if (isRenderUrl(attempt)) {
          supabaseTransformsDisabled = true;
          setAttempt(src);
          return;
        }
        // Step 2: original URL failed — retry with cache-bust.
        if (retriesRef.current < maxRetries) {
          const n = ++retriesRef.current;
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            const bust = src.includes("?") ? "&" : "?";
            setAttempt(`${src}${bust}_r=${n}`);
          }, retryDelay * n);
          return;
        }
        // Step 3: give up — swap in fallback and stop bubbling alt text.
        if (attempt !== fallbackSrc) {
          setFailed(true);
          setAttempt(fallbackSrc);
          if (e) onError?.(e);
        }
      },
      [attempt, src, fallbackSrc, maxRetries, retryDelay, onError]
    );

    // Completion probe: runs synchronously after every attempt commit, then
    // once more shortly after, so a lost `load`/`error` event can never leave a
    // decoded image hidden or a broken one stuck on the grey tile.
    useLayoutEffect(() => {
      const probe = (): boolean => {
        const img = imgRef.current;
        if (!img || !img.complete) return false;
        if (img.naturalWidth > 0) {
          setLoaded(true);
          return true;
        }
        // Decoded-but-empty means the browser already failed this URL.
        if (img.getAttribute("src")) advanceAfterFailure();
        return true;
      };

      if (probe()) return;
      if (recheckTimerRef.current) window.clearTimeout(recheckTimerRef.current);
      recheckTimerRef.current = window.setTimeout(() => {
        recheckTimerRef.current = null;
        probe();
      }, LOST_EVENT_RECHECK_MS);
      return () => {
        if (recheckTimerRef.current) {
          window.clearTimeout(recheckTimerRef.current);
          recheckTimerRef.current = null;
        }
      };
      // `advanceAfterFailure` changes identity with `attempt`, which is the
      // dependency we actually want to re-run on.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);

    const handleError = useCallback(
      (e: SyntheticEvent<HTMLImageElement, Event>) => advanceAfterFailure(e),
      [advanceAfterFailure]
    );

    const handleLoad = useCallback(
      (e: SyntheticEvent<HTMLImageElement, Event>) => {
        setLoaded(true);
        onLoad?.(e);
      },
      [onLoad]
    );

    return (
      <img
        ref={setRefs}
        src={attempt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding={decoding}
        {...({ fetchpriority: priority ? "high" : "auto" } as Record<string, string>)}
        onError={handleError}
        onLoad={handleLoad}
        // Hide alt-text flash during retries; keep layout stable via w/h.
        style={{
          ...style,
          opacity: loaded || failed ? 1 : 0,
          transition: "opacity 150ms ease-out",
          backgroundColor: loaded ? undefined : "rgb(229 231 235)",
        }}
        {...rest}
      />
    );
  }
);

SmartImage.displayName = "SmartImage";
