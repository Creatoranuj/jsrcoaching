import type { SVGProps } from "react";

/**
 * "Rotate device" icon — hand-drawn phone with two curved arrows wrapping
 * around it (one above curving right-down, one below curving left-up).
 * Pure inline SVG (no PNG load) so it scales crisply and follows `currentColor`.
 * Used in the video player and PDF / notes readers.
 */
export function RotatePhoneIcon({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Phone outline — slightly tilted, hand-drawn feel */}
      <g transform="rotate(-25 16 16)">
        <rect x="11" y="7" width="10" height="18" rx="1.8" />
        <line x1="14.2" y1="22.6" x2="17.8" y2="22.6" />
      </g>
      {/* Upper arrow — curves over the top of the phone, points down-right */}
      <path d="M9.5 10.2 C 14 5.6, 22 5.6, 25.6 9.4" />
      <polyline points="25.6 9.4 25.9 12.6 22.7 12.2" />
      {/* Lower arrow — mirrors below, points up-left */}
      <path d="M22.5 21.8 C 18 26.4, 10 26.4, 6.4 22.6" />
      <polyline points="6.4 22.6 6.1 19.4 9.3 19.8" />
    </svg>
  );
}

export default RotatePhoneIcon;
