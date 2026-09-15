import { Suspense, type ReactNode } from "react";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import { useLocation } from "react-router-dom";

/**
 * Wrap <Routes> with platform-tuned page transitions:
 *   - iOS: slide-from-right + fade (250ms)
 *   - Android: fade only (150ms)
 *   - Web: no animation (zero overhead)
 *
 * Usage:
 *   <RouteTransitions>
 *     <Routes location={location} key={location.pathname}>...</Routes>
 *   </RouteTransitions>
 *
 * The child Routes already get the location key, but we wrap with
 * AnimatePresence mode="wait" so exit animations finish before mount.
 */
const NativeRouteTransitions = lazyWithRetry(() => import("./NativeRouteTransitions"));

const isNativeShell =
  typeof window !== "undefined" &&
  (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

const RouteTransitions = ({ children }: { children: ReactNode }) => {
  const location = useLocation();

  if (!isNativeShell) return <>{children}</>;

  return (
    <Suspense fallback={<>{children}</>}>
      <NativeRouteTransitions routeKey={location.pathname}>{children}</NativeRouteTransitions>
    </Suspense>
  );
};

export default RouteTransitions;