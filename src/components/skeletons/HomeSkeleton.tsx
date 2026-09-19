import { memo } from "react";

/**
 * Landing-page skeleton.
 *
 * Replaces the old full-screen spinner shown while auth resolves on `/`.
 * A spinner tells a student "wait"; this mirrors the real home layout
 * (contact bar, header, hero, course cards, stats) so the page feels like it
 * is already there and nothing jumps when the real content swaps in.
 *
 * Deliberately dumb: no network, no library, no timers — only `animate-pulse`.
 */
const Bar = ({ className = "" }: { className?: string }) => (
  <div className={`rounded bg-muted animate-pulse ${className}`} />
);

const HomeSkeleton = memo(({ label = "Home page load ho raha hai" }: { label?: string }) => (
  <div
    role="status"
    aria-busy="true"
    aria-live="polite"
    className="min-h-[100dvh] bg-background pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
  >
    <span className="sr-only">{label}</span>

    {/* Top contact bar */}
    <div className="border-b border-border bg-muted/40">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <Bar className="h-3 w-40 sm:w-64" />
        <Bar className="hidden h-3 w-32 sm:block" />
      </div>
    </div>

    {/* Header */}
    <div className="border-b border-border">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Bar className="h-10 w-10 shrink-0 rounded-xl" />
          <Bar className="h-4 w-28 sm:w-40" />
        </div>
        <div className="hidden items-center gap-5 md:flex">
          <Bar className="h-3 w-16" />
          <Bar className="h-3 w-16" />
          <Bar className="h-3 w-20" />
          <Bar className="h-9 w-24 rounded-lg" />
        </div>
        <Bar className="h-10 w-10 rounded-lg md:hidden" />
      </div>
    </div>

    {/* Hero */}
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <Bar className="h-3 w-32" />
      <Bar className="mt-5 h-8 w-full max-w-2xl sm:h-12" />
      <Bar className="mt-3 h-8 w-4/5 max-w-xl sm:h-12" />
      <Bar className="mt-6 h-4 w-full max-w-xl" />
      <Bar className="mt-2 h-4 w-3/4 max-w-lg" />
      <div className="mt-8 flex flex-wrap gap-3">
        <Bar className="h-12 w-40 rounded-xl" />
        <Bar className="h-12 w-36 rounded-xl" />
      </div>
    </div>

    {/* Course cards */}
    <div className="border-y border-border bg-muted/40 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Bar className="h-3 w-28" />
        <Bar className="mt-4 h-6 w-64 max-w-full" />
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`rounded-2xl border border-border bg-card p-5 ${i === 2 ? "hidden lg:block" : ""}`}
            >
              <Bar className="h-5 w-20 rounded-full" />
              <Bar className="mt-4 h-5 w-3/4" />
              <Bar className="mt-3 h-3 w-full" />
              <Bar className="mt-2 h-3 w-5/6" />
              <Bar className="mt-6 h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Stats row */}
    <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-12 sm:grid-cols-4 sm:px-6 lg:px-8">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border p-4">
          <Bar className="h-6 w-16" />
          <Bar className="mt-3 h-3 w-24" />
        </div>
      ))}
    </div>
  </div>
));

HomeSkeleton.displayName = "HomeSkeleton";

export default HomeSkeleton;
