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
 */
import { expect, type Locator, type Page } from "@playwright/test";

const AFTER_LOGIN = /\/(dashboard|my-courses)/;
const FILL_FIELDS_ERROR = "Please fill in all fields";

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

/** Opens /login and submits the credentials. Does not assert the landing route. */
export async function signIn(page: Page, email: string, password: string) {
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

  // Do not return while authentication is still in flight. Callers often
  // navigate immediately after signIn(); doing that used to cancel the login
  // request and made unrelated route tests land back on /login.
  await expect
    .poll(
      async () => {
        if (!/\/login(?:\?|$)/.test(page.url())) return "landed";
        if (await page.getByText("Logout", { exact: true }).isVisible().catch(() => false)) {
          return "authenticated";
        }
        const error = page.getByText(
          /invalid email or password|invalid login credentials|please fill in all fields/i,
        );
        return (await error.isVisible().catch(() => false)) ? "error" : "pending";
      },
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .not.toBe("pending");

  // The app can render the authenticated shell one paint before replacing
  // the login history entry. Normalize that transient state for callers.
  if (
    /\/login(?:\?|$)/.test(page.url()) &&
    (await page.getByText("Logout", { exact: true }).isVisible().catch(() => false))
  ) {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  }
}

/** Signs in and waits for the post-login route, reporting the inline error. */
export async function signInAndLand(
  page: Page,
  email: string,
  password: string,
  route: RegExp = AFTER_LOGIN,
) {
  await signIn(page, email, password);
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
