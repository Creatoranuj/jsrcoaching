/**
 * Shared sign-in helper for every E2E spec.
 *
 * Two failure modes this fixes for good:
 *
 * 1. Value loss. The login screen is a controlled React form and the app
 *    re-renders it once AuthContext finishes booting. A `fill()` that lands
 *    before that settles is wiped, so the form submits empty and the app
 *    correctly answers "Please fill in all fields". We therefore fill inside
 *    an `expect.toPass()` loop and only submit once both values stick.
 *
 * 2. Strict-mode violations. `getByRole("button", { name: /sign in/i })`
 *    matches both the submit button and the "Sign in with mobile OTP"
 *    button. Always click the `login-submit` test id.
 */
import { expect, type Page } from "@playwright/test";

const AFTER_LOGIN = /\/(dashboard|my-courses)/;

/** Fills a controlled input and re-fills until React keeps the value. */
export async function fillStable(page: Page, testId: string, value: string) {
  const field = page.getByTestId(testId);
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
  await fillStable(page, "login-email", email);
  await fillStable(page, "login-password", password);
  await page.getByTestId("login-submit").click();
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
