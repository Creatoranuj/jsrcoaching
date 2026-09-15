import { memo } from "react";
import { Skeleton } from "../ui/skeleton";

/** Page-shaped shimmer placeholder shown while a PDF is loading. */
const ReaderSkeleton = memo(() => (
  <div
    aria-hidden
    className="absolute inset-0 z-20 flex flex-col items-center gap-3 overflow-hidden bg-background px-4 pt-6 pb-10"
  >
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="mt-2 h-[60vh] w-full max-w-3xl rounded-lg" />
    <Skeleton className="h-3 w-1/3" />
    <Skeleton className="h-3 w-1/4" />
  </div>
));
ReaderSkeleton.displayName = "ReaderSkeleton";
export default ReaderSkeleton;
