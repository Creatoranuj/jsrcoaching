import type { SVGProps } from "react";

/**
 * Hand-drawn 6-petal settings gear with a circular hub.
 * Pure inline SVG — replaces the PNG asset used by the video player so the
 * icon never causes an extra HTTP load and follows `currentColor` for theming.
 */
export function SettingsGearIcon({
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
      {/*
        6 wavy petals arranged around the centre. Each petal is a short cubic
        arc that bulges outward, mimicking the chunky hand-drawn reference.
      */}
      <path
        d="
          M16 3
          C 18.6 3.4, 18.6 6.4, 16 6.8
          C 19.8 6.4, 22.6 7.6, 24.2 9.6
          C 22.4 10.9, 24.5 13.2, 26.4 12.2
          C 28.2 14.2, 28.8 17, 28 19.4
          C 25.6 18.6, 24.2 21.4, 26.2 22.8
          C 24.8 25, 22.4 26.6, 19.6 27
          C 19.4 24.4, 16.4 24.4, 16 27
          C 13.2 27, 10.4 25.6, 8.6 23.4
          C 10.4 22, 8.6 19.4, 6.4 20.4
          C 5.2 18, 5.2 14.8, 6.6 12.4
          C 8.8 13.4, 10.6 10.8, 8.8 9.4
          C 10.6 7.2, 13.2 5.6, 16 5.4
          Z
        "
      />
      {/* Inner hub */}
      <circle cx="16" cy="16" r="3.6" />
    </svg>
  );
}

export default SettingsGearIcon;
