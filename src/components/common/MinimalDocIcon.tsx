/**
 * Minimal monoline document icon — single stroke, folded corner, 3 content
 * lines. Used wherever a PDF/Notes tile needs a calm, top-edtech feel
 * (Linear / Notion / Apple Books style) instead of a heavy filled glyph.
 */
import React from "react";

interface Props extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const MinimalDocIcon = React.forwardRef<SVGSVGElement, Props>(
  ({ size = 24, strokeWidth = 1.5, className, ...rest }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth as number}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* Page outline with folded corner */}
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      {/* Three content lines */}
      <path d="M9 13h6" opacity="0.7" />
      <path d="M9 16.5h4" opacity="0.5" />
    </svg>
  ),
);

MinimalDocIcon.displayName = "MinimalDocIcon";
export default MinimalDocIcon;
