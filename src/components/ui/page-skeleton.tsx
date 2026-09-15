import { memo } from "react";
import { Skeleton } from "./skeleton";
import BrandMark from "../brand/BrandMark";

/**
 * Page-level skeleton for lazy loading
 */
export const PageSkeleton = memo(() => (
  <div className="min-h-dvh bg-background p-4 md:p-8">
    {/* Header skeleton */}
    <div className="flex items-center justify-between mb-8">
      <Skeleton className="h-10 w-40" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
    
    {/* Content skeleton */}
    <div className="space-y-6">
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  </div>
));

PageSkeleton.displayName = "PageSkeleton";

/**
 * Card skeleton for course/lesson cards
 */
export const CardSkeleton = memo(() => (
  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
    <Skeleton className="h-40 w-full rounded-lg" />
    <Skeleton className="h-5 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <div className="flex justify-between items-center pt-2">
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-24" />
    </div>
  </div>
));

CardSkeleton.displayName = "CardSkeleton";

/**
 * Hero section skeleton for landing page
 */
export const HeroSkeleton = memo(() => (
  <div className="pt-24 pb-16 px-4">
    <div className="container mx-auto text-center space-y-6">
      <Skeleton className="h-12 w-3/4 mx-auto" />
      <Skeleton className="h-6 w-1/2 mx-auto" />
      <div className="flex gap-4 justify-center pt-4">
        <Skeleton className="h-12 w-32" />
        <Skeleton className="h-12 w-32" />
      </div>
    </div>
  </div>
));

HeroSkeleton.displayName = "HeroSkeleton";

/**
 * Table skeleton for admin lists
 */
export const TableSkeleton = memo(({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-2">
    <div className="flex gap-4 p-3 bg-muted rounded-lg">
      <Skeleton className="h-5 flex-1" />
      <Skeleton className="h-5 flex-1" />
      <Skeleton className="h-5 flex-1" />
      <Skeleton className="h-5 w-24" />
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-4 p-3 border-b border-border">
        <Skeleton className="h-5 flex-1" />
        <Skeleton className="h-5 flex-1" />
        <Skeleton className="h-5 flex-1" />
        <Skeleton className="h-5 w-24" />
      </div>
    ))}
  </div>
));

TableSkeleton.displayName = "TableSkeleton";

/**
 * Inline loading spinner with timeout message
 */
export const LoadingSpinner = memo(({ 
  message = "Loading...",
  showRetry = false,
  onRetry 
}: { 
  message?: string;
  showRetry?: boolean;
  onRetry?: () => void;
}) => (
  <div className="flex flex-col items-center justify-center gap-4 py-12">
    <div className="relative">
      {/* Inline SVG mark — was /logo.webp (network round-trip caused a flash). */}
      <BrandMark size={48} className="h-12 w-12 rounded-xl mahima-loader-logo" decorative />
      <div className="absolute inset-0 rounded-xl border-2 border-primary/40 mahima-loader-ring" />
    </div>
    <p className="text-muted-foreground text-sm">{message}</p>
    {showRetry && onRetry && (
      <button 
        onClick={onRetry}
        className="text-primary hover:underline text-sm font-medium"
      >
        Retry
      </button>
    )}
  </div>
));

LoadingSpinner.displayName = "LoadingSpinner";

/**
 * Offline fallback component
 */
export const OfflineFallback = memo(({ onRetry }: { onRetry?: () => void }) => (
  <div className="min-h-dvh flex flex-col items-center justify-center bg-background p-4">
    <div className="text-center space-y-4 max-w-md">
      <div className="h-16 w-16 mx-auto text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 1l22 22M9 9a3 3 0 014.97-2.24M5.64 5.64A9 9 0 0112 3c4.97 0 9 4.03 9 9 0 1.1-.2 2.14-.55 3.11M12 12v.01" />
          <path d="M12 12a3 3 0 00-3 3v.01" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-foreground">Connection Lost</h2>
      <p className="text-muted-foreground">
        Please check your internet connection and try again.
      </p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Retry Connection
        </button>
      )}
    </div>
  </div>
));

OfflineFallback.displayName = "OfflineFallback";
