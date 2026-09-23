/**
 * Shared sign-in helper for every E2E spec.
 *
 * Failure modes this fixes for good:
 *
 * 1. Value loss. The login screen is a controlled React form and the app
 *    re-renders it once AuthContext finishes booting. A `fill()` that lands
 *    before that settles — or a re-render that lands between the fill and
 *    the click — is wiped, so the form submits empty and the app correctly
 *    answers "Please fill in all fields". We therefore fill inside an
 *    `expect.toPass()` loop and RETRY the whole fill+submit cycle whenever
 *    that error appears, instead of failing the test.
 *
 * 2. Strict-mode violations. `getByRole("button", { name: /sign in/i })`
 *    matches both the submit button and the "Sign in with mobile OTP"
 *    button. Always click the `login-submit` test id.
 *
 * 3. Auth rate limiting (run #283, 2026-09-23). ~100 password sign-ins per
 *    run from one runner IP tripped Supabase's default sign-in rate limit
 *    (30 per 5 min per IP), so tests mid-run were answered with 429 and sat
 *    on /login. Each account now goes through the login FORM once per worker
 *    process; every later `signIn` for the same credentials restores the
 *    captured `sb-<ref>-auth-token` localStorage entry and lands on
 *    /dashboard directly. Tokens are not rotated inside an 18-minute run
 *    (Supabase refreshes only near expiry), so the captured session stays
 *    valid and no refresh-token reuse is triggered. Wrong credentials never
 *    hit the cache (it is keyed by email + password), and callers that must
 *    exercise the real form pass `{ fresh: true }`.
 */
import { expect, type Locator, type Page } from "@playwright/test";

const AFTER_LOGIN = /\/(dashboard|my-courses)/;
const FILL_FIELDS_ERROR = "Please fill in all fields";
const AUTH_TOKEN_KEY = /^sb-.+-auth-token$/;

type StoredSession = Record<string, string>;
/** email\npassword -> localStorage auth entries captured after a real form login. */
const sessionCache = new Map<string, StoredSession>();

export interface SignInOptions {
  /** Always drive the login form, even when a session for this account is cached. */
  fresh?: boolean;
}

/** Drops cached sessions (e.g. after a test signs the account out). */
export function forgetCachedSession(email?: string) {
  if (!email) { sessionCache.clear(); return; }
  for (const key of [...sessionCache.keys()]) if (key.startsWith(`${email}\n`)) sessionCache.delete(key);
}

async function captureSession(page: Page): Promise<StoredSession | null> {
  const entries = await page
    .evaluate((pattern) => {
      const re = new RegExp(pattern);
      return Object.entries(localStorage).filter(([k]) => re.test(k));
    }, AUTH_TOKEN_KEY.source)
    .catch(() => [] as [string, string][]);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/** Restores a captured session and lands on /dashboard. False when the app bounced to /login. */
async function restoreSession(page: Page, stored: StoredSession): Promise<boolean> {
  // localStorage is per-origin, so establish the app origin on a light public route first.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, stored);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  try {
    await page.waitForURL(AFTER_LOGIN, { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

/** Fills a controlled input and re-fills until React keeps the value. */
export async function fillStable(page: Page, testId: string, value: string) {
  await fillStableLocator(page.getByTestId(testId), value);
}

/** Same as fillStable but for any locator (e.g. signup fields addressed by id). */
export async function fillStableLocator(field: Locator, value: string) {
  await expect(field).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 2_000 });
  }).toPass({ timeout: 30_000, intervals: [250, 500, 1_000] });
}

/** Drives the real login form. Does not assert the landing route. */
export async function signInViaForm(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("login-form")).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await fillStable(page, "login-email", email);
    await fillStable(page, "login-password", password);
    await page.getByTestId("login-submit").click();
    // A re-render can clear the controlled fields between the fill and the
    // click; the app then shows the fill-fields error. Retry the whole
    // cycle in that case. Any other inline error (e.g. invalid credentials)
    // means the submit actually ran — leave it for the caller to assert.
    await expect(page.getByText(FILL_FIELDS_ERROR)).toHaveCount(0, { timeout: 1_500 });
  }).toPass({ timeout: 90_000, intervals: [500, 1_000, 2_000] });
}

/**
 * Signs in as `email`. First call per credentials in this worker drives the
 * login form and caches the resulting session; later calls restore it and
 * land on /dashboard without another password grant. Does not assert the
 * landing route (a wrong password leaves the inline error on /login exactly
 * as before).
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
  options: SignInOptions = {},
) {
  const cacheKey = `${email}\n${password}`;
  const cached = options.fresh ? undefined : sessionCache.get(cacheKey);
  if (cached) {
    if (await restoreSession(page, cached)) return;
    // Session no longer accepted (signed out elsewhere / expired) — fall back to the form.
    sessionCache.delete(cacheKey);
  }

  await signInViaForm(page, email, password);

  // Capture the session once the app has actually landed; a failed submit
  // (wrong password) never reaches AFTER_LOGIN and therefore caches nothing.
  const landed = await Promise.race([
    page.waitForURL(AFTER_LOGIN, { timeout: 30_000 }).then(() => true),
    // Wrong credentials: the inline error appears long before the URL timeout.
    page.locator("p.text-destructive").first().waitFor({ state: "visible", timeout: 30_000 }).then(() => false),
  ]).catch(() => false);
  if (landed) {
    const stored = await captureSession(page);
    if (stored) sessionCache.set(cacheKey, stored);
  }
}

/** Signs in and waits for the post-login route, reporting the inline error. */
export async function signInAndLand(
  page: Page,
  email: string,
  password: string,
  route: RegExp = AFTER_LOGIN,
  options: SignInOptions = {},
) {
  await signIn(page, email, password, options);
  try {
    await page.waitForURL(route, { timeout: 30_000 });
  } catch {
    const inline = await page
      .locator("p.text-destructive")
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      `Sign-in did not reach ${route} (url=${page.url()}). Inline error: ${inline?.trim() || "none"}. ` +
        "If it reports invalid credentials, refresh the test-account repo secrets.",
    );
  }
}
