/**
 * Did Supabase persist a session in this browser/WebView?
 *
 * WHY THIS EXISTS
 * `AuthProvider` flips `isLoading` to false after a 6s ceiling so a stuck
 * `getSession()` can never freeze the app on a spinner. But that ceiling also
 * made `ProtectedRoute` conclude "not signed in" and bounce a signed-in
 * student to `/login` — reproduced live on `/classes/34/lessons` (deep link /
 * payment return / shared lesson link, i.e. exactly the cold-start paths).
 *
 * A persisted `sb-<ref>-auth-token` key means a session almost certainly
 * exists and is merely slow to restore, so the guard keeps waiting instead of
 * redirecting. It is a HINT only — never an authorisation signal. Every read
 * is still enforced server-side by RLS.
 */
export const hasStoredSupabaseSession = (): boolean => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (raw && raw !== "null" && raw.length > 2) return true;
    }
    return false;
  } catch {
    // Private mode / storage disabled → behave as "no hint".
    return false;
  }
};
