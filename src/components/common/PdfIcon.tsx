import { cn } from "@/lib/utils";

interface PdfIconProps {
  className?: string;
  /** Kept for back-compat; ignored now that the icon is inline SVG. */
  imgClassName?: string;
}

/**
 * Inline SVG PDF icon — replaces the previous PNG asset so it scales crisply,
 * inherits theme color, and avoids a CDN round-trip on every render.
 * Mirrors the uploaded mark: two overlapping rounded squares with "PDF" text.
 */
export default function PdfIcon({ className }: PdfIconProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-destructive/10 text-destructive",
        className
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        className="h-3/4 w-3/4"
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 18 V52 a4 4 0 0 0 4 4 H46" />
        <rect x="20" y="8" width="36" height="36" rx="6" ry="6" />
        <text
          x="38"
          y="32"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          fontWeight="800"
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
          fill="currentColor"
          stroke="none"
        >
          PDF
        </text>
      </svg>
    </span>
  );
}