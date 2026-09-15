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

    useEffect(() => {
      retriesRef.current = 0;
      setLoaded(false);
      setFailed(false);
      setAttempt(toSupabaseRender(src, width));
      return () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
      };
    }, [src, width]);

    useLayoutEffect(() => {
      const img = imgRef.current;
      if (!img) return;

      // Firefox/Android WebView can satisfy cached image requests before React's
      // onLoad handler runs. Without this guard the image stays at opacity:0,
      // which looks like thumbnails never loaded even though naturalWidth > 0.
      if (img.complete && img.naturalWidth > 0) {
        setLoaded(true);
      }
    }, [attempt]);

    const handleError = useCallback(
      (e: SyntheticEvent<HTMLImageElement, Event>) => {
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
          timerRef.current = window.setTimeout(() => {
            const bust = src.includes("?") ? "&" : "?";
            setAttempt(`${src}${bust}_r=${n}`);
          }, retryDelay * n);
          return;
        }
        // Step 3: give up — swap in fallback and stop bubbling alt text.
        if (attempt !== fallbackSrc) {
          setFailed(true);
          setAttempt(fallbackSrc);
          onError?.(e);
        }
      },
      [attempt, src, fallbackSrc, maxRetries, retryDelay, onError]
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
