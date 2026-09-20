/**
 * JSR COACHING — the one public page that explains + serves an app update.
 *
 * The in-app "Update" button must NOT open the APK link inside an in-app
 * WebView: Android's embedded WebView has no download handler, so the tap
 * looked dead to students. Instead we send them to this page in the phone's
 * real browser, where a normal download + install flow works.
 *
 * Deliberately NOT listed in `DEEP_LINK_PATH_PREFIXES`: if `/update` were an
 * App Link, Android would bounce the browser straight back into the app and
 * the download would never start.
 */
import { PUBLIC_WEB_ORIGIN } from "@/lib/authRedirect";

export const UPDATE_PAGE_PATH = "/update";

/** Absolute URL of the update page on the verified public web host. */
export const UPDATE_PAGE_URL = `${PUBLIC_WEB_ORIGIN}${UPDATE_PAGE_PATH}`;

/** True when `url` is exactly our own update page (used to validate pushes). */
export function isUpdatePageUrl(url: unknown): url is string {
  return typeof url === "string" && url.trim() === UPDATE_PAGE_URL;
}
