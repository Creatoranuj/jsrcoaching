/**
 * authRedirect.ts
 * ================
 * Builds the absolute URL that Supabase Auth emails (password reset, magic
 * link, email confirm) should point back at.
 *
 * WHY THIS EXISTS: inside the Capacitor APK `window.location.origin` is
 * `https://localhost` — a URL that only exists on the device. A reset email
 * built from it can never be opened, so the link looked "dead" to students.
 * We therefore always fall back to the verified public web host, which is
 * claimed as an Android App Link (see `src/config/deepLinks.ts` +
 * AndroidManifest), so tapping the link opens the app when it is installed
 * and the website otherwise.
 */
import { APP_LINK_HOSTS, DEV_LINK_HOSTS } from "@/config/deepLinks";

/** Verified public web origin. Must be listed in Supabase Auth → Redirect URLs. */
export const PUBLIC_WEB_ORIGIN = `https://${APP_LINK_HOSTS[0]}`;

const LOCAL_DEV_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Absolute redirect target for an auth email.
 * Uses the current origin only when it is a host we trust (public web host,
 * Lovable preview sandbox, or localhost during `npm run dev`); otherwise the
 * public web origin.
 */
export const authRedirectUrl = (path: string): string => {
  const suffix = path.startsWith("/") ? path : `/${path}`;

  try {
    const { protocol, hostname, origin } = window.location;
    const trusted: string[] = [
      ...APP_LINK_HOSTS,
      ...DEV_LINK_HOSTS,
      ...(import.meta.env.DEV ? LOCAL_DEV_HOSTS : []),
    ];
    if (protocol.startsWith("http") && trusted.includes(hostname)) {
      return `${origin}${suffix}`;
    }
  } catch {
    // No `window` (SSR / tests) — fall through to the public origin.
  }

  return `${PUBLIC_WEB_ORIGIN}${suffix}`;
};
