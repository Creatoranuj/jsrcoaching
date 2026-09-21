import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SmartImage } from "./SmartImage";
import coursePlaceholder from "@/assets/thumbnails/course-default.svg";

interface CourseThumbnailProps {
  src?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  children?: ReactNode;
}

/**
 * A crop-safe 16:9 course artwork frame. Landscape artwork fills the frame;
 * square and portrait artwork remains fully visible over a softly-filled copy.
 */
export function CourseThumbnail({
  src,
  alt,
  className,
  imageClassName,
  width = 640,
  height = 360,
  priority = false,
  children,
}: CourseThumbnailProps) {
  const imageSrc = src || coursePlaceholder;

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-muted", className)}>
      <div className="absolute inset-0 opacity-45" aria-hidden="true">
        <SmartImage
          src={imageSrc}
          alt=""
          width={width}
          height={height}
          fallbackSrc={coursePlaceholder}
          className="h-full w-full scale-110 object-cover blur-xl"
        />
      </div>
      <div className="absolute inset-0 bg-background/15" aria-hidden="true" />
      <SmartImage
        src={imageSrc}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        fallbackSrc={coursePlaceholder}
        className={cn("relative h-full w-full object-contain", imageClassName)}
      />
      {children}
    </div>
  );
}
