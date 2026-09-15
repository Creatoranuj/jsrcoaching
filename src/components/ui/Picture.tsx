/**
 * Picture — modern responsive <picture> wrapper.
 *
 * Source order: AVIF → WebP → fallback <img>. Browsers pick the first
 * <source> they can decode, so AVIF-capable clients save ~48% vs WebP
 * (measured in Phase B1 audit on landing imagery).
 *
 * Author-time encoded assets only — import the .avif + .webp files from
 * `src/assets/landing/` directly. Do NOT pipe through vite-imagetools;
 * the AVIFs are hand-tuned (`avifenc --min 30 --max 45 -s 4`) and any
 * runtime re-encode would undo that work.
 *
 * Always pass width + height to prevent layout shift (CLS).
 */
import { forwardRef, memo, type ImgHTMLAttributes } from "react";

export interface PictureProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "loading"> {
  /** AVIF source (preferred — ~48% smaller than WebP). Optional. */
  srcAvif?: string;
  /** WebP source (preferred fallback). Optional. */
  srcWebp?: string;
  /** Required <img> fallback — original WebP/PNG/JPG URL. */
  srcFallback: string;
  /** Intrinsic width in CSS px — required for CLS. */
  width: number;
  /** Intrinsic height in CSS px — required for CLS. */
  height: number;
  /** Alt text — required for a11y; pass "" for purely decorative images. */
  alt: string;
  /** LCP / above-the-fold → eager + high priority. Default lazy. */
  priority?: boolean;
  /** Optional wrapper className on the <picture> element. */
  pictureClassName?: string;
}

const PictureInner = forwardRef<HTMLImageElement, PictureProps>(function Picture(
  {
    srcAvif,
    srcWebp,
    srcFallback,
    width,
    height,
    alt,
    priority = false,
    pictureClassName,
    decoding = "async",
    className,
    ...imgRest
  },
  ref
) {
  return (
    <picture className={pictureClassName}>
      {srcAvif ? <source srcSet={srcAvif} type="image/avif" /> : null}
      {srcWebp ? <source srcSet={srcWebp} type="image/webp" /> : null}
      <img
        ref={ref}
        src={srcFallback}
        width={width}
        height={height}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding={decoding}
        className={className}
        {...({ fetchpriority: priority ? "high" : "auto" } as Record<string, string>)}
        {...imgRest}
      />
    </picture>
  );
});

export const Picture = memo(PictureInner);
export default Picture;
