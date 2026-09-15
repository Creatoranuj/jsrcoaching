import { Suspense, type ReactNode } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackTitle?: string;
}

/**
 * ErrorBoundary + Suspense composed with a skeleton fallback (not a
 * centered spinner). Use around any protected surface so a runtime
 * error or slow chunk never leaves the user staring at a blank screen.
 */
export function SafeBoundary({ children, fallback, fallbackTitle }: Props) {
  return (
    <ErrorBoundary fallbackTitle={fallbackTitle}>
      <Suspense fallback={fallback ?? <DefaultSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function DefaultSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-hidden>
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="aspect-video w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
