/**
 * BrandMark — real NB logo served from /brand/jsr-mark.webp (~7KB webp).
 * The asset is bundled into the app shell (Capacitor ships it as a local
 * file under the WebView origin), so the network cost is effectively zero
 * while keeping the JS initial-entry chunk lean — the previous inline
 * data URL added ~6–7KB of base64 to every cold start.
 */
import { memo } from "react";

const NB_MARK_SRC = "/brand/jsr-mark.webp";

interface BrandMarkProps {
  className?: string;
  size?: number;
  decorative?: boolean;
  title?: string;
}

const BrandMarkInner = ({
  className,
  size = 64,
  decorative = false,
  title = "JSR COACHING",
}: BrandMarkProps) => (
  <img
    src={NB_MARK_SRC}
    width={size}
    height={size}
    alt={decorative ? "" : title}
    aria-hidden={decorative || undefined}
    className={className}
    draggable={false}
    decoding="async"
    {...({ fetchpriority: "high" } as Record<string, string>)}
    style={{ objectFit: "contain" }}
  />
);

export const BrandMark = memo(BrandMarkInner);
export default BrandMark;
