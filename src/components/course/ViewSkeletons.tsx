import { Skeleton } from "../ui/skeleton";
import type { ViewMode } from "./ContentViewSwitcher";

export const ViewSkeletons = ({ view }: { view: ViewMode }) => {
  if (view === "gallery") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-2xl overflow-hidden bg-card shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
            <Skeleton className="aspect-video w-full" />
            <div className="p-3.5 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (view === "table") {
    return (
      <div className="bg-card rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4 py-3 border-b border-border/50 flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  // List view skeleton — matches the final card silhouette:
  // full-width rounded rectangles stacked with a shimmering glare.
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton
          key={i}
          className="h-[86px] w-full rounded-2xl border border-border/40"
        />
      ))}
    </div>
  );
};
