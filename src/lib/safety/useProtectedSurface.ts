import { useScreenProtection } from "@/hooks/useScreenProtection";
import { useWebScreenshotShield } from "@/hooks/useWebScreenshotShield";
import { useIsMountedRef } from "./useIsMountedRef";

export interface ProtectedSurfaceOptions {
  /**
   * Master switch. When false the surface behaves like any normal page
   * (no FLAG_SECURE, no admin bypass logic).
   * @default true
   */
  protect?: boolean;
}

export interface ProtectedSurfaceApi {
  /** Ref that flips to false on unmount — guard post-await setters. */
  isMountedRef: ReturnType<typeof useIsMountedRef>;
}

/**
 * One-hook scaffold for any "protected" surface (paid lesson video, DRM'd
 * PDF, exam content). Composes:
 *   - Ref-counted FLAG_SECURE via `useScreenProtection` (fail-safe ON
 *     until AuthContext resolves the role).
 *   - Admin bypass wiring is inherited from `useScreenProtection` — admins
 *     opt-in per-device from Admin → Security.
 *   - `isMountedRef` to safely guard async setters.
 *
 * Usage:
 * ```tsx
 * const { isMountedRef } = useProtectedSurface();
 * // ...
 * const data = await fetchThing();
 * if (!isMountedRef.current) return;
 * setState(data);
 * ```
 */
export function useProtectedSurface(
  options: ProtectedSurfaceOptions = {},
): ProtectedSurfaceApi {
  const { protect = true } = options;
  useScreenProtection(protect);
  useWebScreenshotShield(protect);
  const isMountedRef = useIsMountedRef();
  return { isMountedRef };
}
