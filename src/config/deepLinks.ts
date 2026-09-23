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

/** Base used to re-parse the custom-scheme remainder with a *special* scheme. */
const APP_SCHEME_PARSE_BASE = "https://deeplink.invalid";

/**
 * Splits `com.jsrcoaching.app://classes/30/lessons?x#y` into router parts
 * WITHOUT trusting `new URL(rawUrl)` for the custom scheme.
 *
 * Why: Chromium < 130 (Android System WebView 109 on the API 33 emulator, and
 * every phone whose WebView never got a Play update) parses non-special
 * schemes as an opaque path — `host` is "" and `pathname` is
 * "//classes/30/lessons". The old `host + pathname` join therefore produced
 * "//classes/…", failed the allow-list, and the app silently stayed on the
 * screen it was on for EVERY custom-scheme link (lesson deep links, the
 * Razorpay `payment-callback` return, `openLink` in Maestro). Modern engines
 * (Chromium ≥ 130, Firefox, Safari, Node) return host="classes" and the join
 * happened to work, which is why the unit tests never caught it.
 *
 * Cutting the string ourselves and re-parsing the remainder against an https
 * base gives identical results on every engine, including dot-segment
 * normalisation (`classes/../admin` → `/admin` → rejected) and `?`/`#`
 * splitting. Returns null when `rawUrl` is not the app scheme at all.
 */
const parseAppSchemeUrl = (
  rawUrl: string,
): { pathname: string; search: string; hash: string } | null => {
  const prefix = `${APP_SCHEME}:`;
  if (rawUrl.slice(0, prefix.length).toLowerCase() !== prefix) return null;
  // Drop the authority slashes ("//"), plus any extras a sloppy sender adds.
  const rest = rawUrl.slice(prefix.length).replace(/^[\\/]+/, "");
  const u = new URL(`/${rest}`, APP_SCHEME_PARSE_BASE);
  return { pathname: u.pathname, search: u.search, hash: u.hash };
};

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
    const app = parseAppSchemeUrl(rawUrl);
    if (app) {
      // `scheme://payment-callback?x=1` → "/payment-callback?x=1".
      if (app.pathname !== "/" && !isAllowedDeepLinkPath(app.pathname)) return null;
      // Preserve #hash so video-timestamp / section anchors survive.
      return app.pathname + app.search + app.hash;
    }

    const u = new URL(rawUrl);

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
