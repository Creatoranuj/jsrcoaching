// JSR COACHING — where the in-app "Update karein" button is allowed to send a
// student.
//
// The update prompt reads its link from `app_config.android_store_url`, which
// is written by CI (set-latest-version) and editable by admins. Anything that
// ends up in a DB column must be treated as untrusted before it becomes a
// navigation target, so every link is checked against a tiny allow-list:
//
//   1. our own GitHub release assets (CI publishes these automatically), or
//   2. the Play Store / App Store listing (manual admin override).
//
// Everything else — http://, javascript:, data:, a random file host — is
// rejected and the caller falls back to the stable download endpoint.

/** Stable, never-changing download endpoint (redirects to the current APK). */
export const APP_DOWNLOAD_ENDPOINT =
  "https://wegamscqtvqhxowlskfm.supabase.co/functions/v1/app-download";

/** Fixed-name asset of the newest GitHub release — CI always attaches it. */
export const LATEST_APK_FALLBACK =
  "https://github.com/Creatoranuj/jsrcoaching/releases/latest/download/JSRCoaching.apk";

const GITHUB_RELEASE_RE =
  /^https:\/\/github\.com\/Creatoranuj\/jsrcoaching\/releases\/(download\/[^/]+\/[^/]+|latest\/download\/[^/]+)$/;

const STORE_RE =
  /^https:\/\/(play\.google\.com\/store\/apps\/|apps\.apple\.com\/)[\w\-./?=&%]+$/;

/** True when `url` is a link we are willing to open for an app update. */
export function isAllowedUpdateUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return false;
  return GITHUB_RELEASE_RE.test(trimmed) || STORE_RE.test(trimmed);
}

/** True when the link is one of our GitHub release assets (not a store page). */
export function isGitHubReleaseAsset(url: unknown): url is string {
  return typeof url === "string" && GITHUB_RELEASE_RE.test(url.trim());
}

/**
 * Resolves the URL the update button should open.
 *
 * - Store listing configured by an admin → use it as-is (Play Store wins, it
 *   handles its own updates).
 * - GitHub release asset (the CI default) → use the stable `app-download`
 *   endpoint so the link keeps working across releases and can be changed or
 *   switched off in one place.
 * - Anything missing or not allow-listed → stable endpoint as well, which
 *   itself falls back to the newest release.
 */
export function resolveUpdateDownloadUrl(configuredUrl: unknown): string {
  const trimmed = typeof configuredUrl === "string" ? configuredUrl.trim() : "";
  if (isAllowedUpdateUrl(trimmed) && !isGitHubReleaseAsset(trimmed)) return trimmed;
  return APP_DOWNLOAD_ENDPOINT;
}
