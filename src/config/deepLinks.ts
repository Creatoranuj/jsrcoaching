/**
 * Single source of truth for deep-link routing.
 *
 * IMPORTANT: `APP_LINK_HOSTS` and `DEEP_LINK_PATH_PREFIXES` are mirrored by
 * hand in `android/app/src/main/AndroidManifest.xml` (App Links intent-filter)
 * and by `public/.well-known/assetlinks.json`, which must be served from every
 * host listed here. Change all three together.
 */

/** Custom URL scheme registered in AndroidManifest (`<data android:scheme>`). */
export const APP_SCHEME = "com.jsrcoaching.app";

/** Verified https hosts whose links open inside the app (Android App Links). */
export const APP_LINK_HOSTS = [
  // Live web host. The pre-rebrand names (`sadguruclasses`,
  // `safarenglishka`) are retired and deliberately NOT trusted.
  "jsrcoaching.vercel.app",
] as const;

/** Dev-only hosts (Lovable preview sandboxes). Never shipped to production. */
export const DEV_LINK_HOSTS = [
  "4073789d-46b9-4e05-8999-7aaeebbeb47b.lovableproject.com",
  "id-preview--4073789d-46b9-4e05-8999-7aaeebbeb47b.lovable.app",
] as const;

/**
 * Path prefixes the app claims. Anything outside this list is rejected so a
 * malicious link can't drive the router to an arbitrary internal surface.
 */
export const DEEP_LINK_PATH_PREFIXES = [
  "/course",
  "/my-courses",
  "/classes",
  "/lesson",
  "/chapter",
  "/quiz",
  "/live",
  "/reset-password",
  "/payment-callback",
  "/buy-course",
  "/dashboard",
  "/profile",
  "/settings",
  "/library",
] as const;

export const isAllowedDeepLinkHost = (hostname: string, dev = false): boolean =>
  (APP_LINK_HOSTS as readonly string[]).includes(hostname) ||
  (dev && (DEV_LINK_HOSTS as readonly string[]).includes(hostname));

export const isAllowedDeepLinkPath = (pathname: string): boolean =>
  DEEP_LINK_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

/**
 * Converts an external deep-link URL into an internal router path.
 * Returns `null` for anything untrusted (foreign host, unknown scheme,
 * unclaimed path) so the caller can safely ignore it.
 */
export const toInternalPath = (
  rawUrl: string,
  opts: { dev?: boolean } = {},
): string | null => {
  try {
    const u = new URL(rawUrl);

    if (u.protocol === `${APP_SCHEME}:`) {
      // `scheme://payment-callback?x=1` parses host="payment-callback".
      const path = (u.host ? `/${u.host}` : "") + u.pathname;
      const normalized = path || "/";
      if (normalized !== "/" && !isAllowedDeepLinkPath(normalized)) return null;
      // Preserve #hash so video-timestamp / section anchors survive.
      return normalized + u.search + u.hash;
    }

    if (
      (u.protocol === "https:" || u.protocol === "http:") &&
      isAllowedDeepLinkHost(u.hostname, opts.dev)
    ) {
      if (!isAllowedDeepLinkPath(u.pathname)) return null;
      return u.pathname + u.search + u.hash;
    }

    return null;
  } catch {
    return null;
  }
};
