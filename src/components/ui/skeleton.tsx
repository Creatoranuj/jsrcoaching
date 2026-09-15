import { cn } from "../../lib/utils";

/**
 * Base skeleton primitive — shimmering muted surface.
 * Uses the `.skeleton-shimmer` utility (see `src/index.css`) which paints a
 * diagonal glare sweep across the block. Respects reduced-motion.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton-shimmer rounded-md", className)} {...props} />;
}

export { Skeleton };
