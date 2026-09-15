import type { SVGProps } from "react";

/**
 * Custom hamburger — 3 horizontal rounded bars, third bar shorter (left-aligned).
 * Matches the reference sketch (Screenshot_20260627-192304). Inline SVG so no
 * raster asset is shipped and no extra network cost. Inherits `currentColor`
 * so it themes correctly under Lovable's ghost button pattern.
 */
export function HamburgerIcon({
  className,
  strokeWidth = 2.25,
  ...rest
}: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="13" y2="17" />
    </svg>
  );
}

export default HamburgerIcon;
