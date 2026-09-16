/**
 * JSR Coaching — E2E tests for the authentication flow.
 *
 * Credentials come from CI secrets, never hardcoded:
 *   TEST_USER_EMAIL / TEST_USER_PASSWORD (falls back to E2E_EMAIL / E2E_PASSWORD)
 *     — a real student account.
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD — an account with the admin role.
 *
 * Anything that needs a login is skipped (not failed) when the matching
 * secret is absent, so PRs from forks stay green.
 *
 * Hydration note: every interaction goes through `openLogin()` /
 * `openSignup()`, which wait until React has actually attached its handlers.
 * The previous version clicked `button[type=submit]` on the raw HTML, so the
 * browser performed a native form GET instead of running `handleSubmit` —
 * fields were wiped, no inline error appeared, and half of this file failed
 * for reasons that had nothing to do with the app.
 */

import { test, expect, Page } from "@playwright/test";
import { fillStable, signIn, signInAndLand } from "./helpers/auth";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || process.env.E2E_EMAIL || "",
  password: process.env.TEST_USER_PASSWORD || process.env.E2E_PASSWORD || "",
};

const ADMIN_USER = {
  email: process.env.E2E_ADMIN_EMAIL || "",
  password: process.env.E2E_ADMIN_PASSWORD || "",
};

const HAS_USER = !!(TEST_USER.email && TEST_USER.password);
const HAS_ADMIN = !!(ADMIN_USER.email && ADMIN_USER.password);

/** After login the app lands on /dashboard; some accounts bounce to /my-courses. */
const AFTER_LOGIN = /\/(dashboard|my-courses)/;

/** Waits for the React-controlled login form to be interactive. */
async function openLogin(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("login-form")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("login-submit")).toBeEnabled();
}

async function openSignup(page: Page) {
  await page.goto(`${BASE_URL}/signup`, { waitUntil: "domcontentloaded" });
  const name = page.locator('input[id="name"]');
  await expect(name).toBeVisible({ timeout: 30_000 });
  // Same controlled-input settle as the login screen.
  await expect(async () => {
    await name.fill("Hydration Probe");
    await expect(name).toHaveValue("Hydration Probe", { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await name.fill("");
}

async function login(page: Page, email: string, password: string) {
  await signIn(page, email, password);
}

/** Login + land on the post-login route, surfacing the inline error if any. */
async function loginAndLand(page: Page, email: string, password: string) {
  await signInAndLand(page, email, password, AFTER_LOGIN);
}


// ============================================================
// PUBLIC FORM BEHAVIOUR (no credentials needed)
// ============================================================

test.describe("Authentication Flow", () => {
  test.describe("Login Page", () => {
    test("should display login form", async ({ page }) => {
      await openLogin(page);

      await expect(page.getByRole("heading", { name: /Welcome Back/i })).toBeVisible();
      await expect(page.getByTestId("login-email")).toBeVisible();
      await expect(page.getByTestId("login-password")).toBeVisible();
      await expect(page.getByTestId("login-submit")).toBeVisible();
    });

    test("should show error for empty fields", async ({ page }) => {
      await openLogin(page);
      await page.getByTestId("login-submit").click();

      await expect(page.getByText("Please fill in all fields")).toBeVisible({ timeout: 15_000 });
    });

    test("should show error for invalid credentials", async ({ page }) => {
      await login(page, "wrong@email.com", "wrongpassword");

      await expect(
        page.getByText(/invalid email or password|invalid login credentials/i).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("should toggle password visibility", async ({ page }) => {
      await openLogin(page);

      const passwordInput = page.getByTestId("login-password");
      await expect(passwordInput).toHaveAttribute("type", "password");

      await page.getByRole("button", { name: "Show password" }).click();
      await expect(passwordInput).toHaveAttribute("type", "text", { timeout: 10_000 });

      await page.getByRole("button", { name: "Hide password" }).click();
      await expect(passwordInput).toHaveAttribute("type", "password");
    });

    test("should navigate to signup page", async ({ page }) => {
      await openLogin(page);
      await page.getByRole("link", { name: "Create account" }).click();

      await expect(page).toHaveURL(/\/signup/);
    });
  });

  test.describe("Signup Page", () => {
    test("should display signup form", async ({ page }) => {
      await openSignup(page);

      // Signup has two password fields — address them by id, never by
      // `input[type=password]` (strict-mode violation).
      await expect(page.locator('input[id="email"]')).toBeVisible();
      await expect(page.locator('input[id="password"]')).toBeVisible();
      await expect(page.locator('input[id="confirmPassword"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    });

    test("should show error for existing email", async ({ page }) => {
      test.skip(!HAS_USER, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

      await openSignup(page);
      await page.locator('input[id="name"]').fill("Existing User");
      await page.locator('input[id="email"]').fill(TEST_USER.email);
      await page.locator('input[id="password"]').fill("Password123!");
      await page.locator('input[id="confirmPassword"]').fill("Password123!");
      await page.locator('button[type="submit"]').first().click();

      await expect(
        page
          .getByText(/already registered|already exists|already in use|user already/i)
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    });
  });
});

// ============================================================
// AUTHENTICATED FLOWS (student account)
// ============================================================

test.describe("Authenticated student", () => {
  test.skip(!HAS_USER, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  test("should redirect to dashboard on successful login", async ({ page }) => {
    await loginAndLand(page, TEST_USER.email, TEST_USER.password);
  });

  test("should maintain session across page refresh", async ({ page }) => {
    await loginAndLand(page, TEST_USER.email, TEST_USER.password);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(AFTER_LOGIN, { timeout: 30_000 });
  });

  test("student should not reach the admin panel", async ({ page }) => {
    await loginAndLand(page, TEST_USER.email, TEST_USER.password);

    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);

    // A non-admin is either bounced away or shown a denial screen — both count.
    const bounced = /\/(login|admin-login|dashboard|my-courses)(\?|$|\/)/.test(page.url());
    if (!bounced) {
      await expect(
        page
          .getByText(/Access Denied|not authorized|Unauthorized|admin login|permission/i)
          .first(),
      ).toBeVisible({ timeout: 20_000 });
    }
  });

  test("dashboard should load within 20 seconds after login", async ({ page }) => {
    await openLogin(page);
    await fillStable(page, "login-email", TEST_USER.email);
    await fillStable(page, "login-password", TEST_USER.password);

    const startTime = Date.now();
    await page.getByTestId("login-submit").click();
    await page.waitForURL(AFTER_LOGIN, { timeout: 30_000 });

    expect(Date.now() - startTime).toBeLessThan(20_000);
  });
});

test.describe("Authenticated admin", () => {
  test.skip(!HAS_ADMIN, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");

  test("admin should access admin panel", async ({ page }) => {
    await loginAndLand(page, ADMIN_USER.email, ADMIN_USER.password);
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText(/Admin/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

// ============================================================
// NAVIGATION
// ============================================================

test.describe("Navigation", () => {
  test("unauthenticated user should access public pages", async ({ page }) => {
    // /courses and /books sit behind ProtectedRoute — the genuinely public
    // screens are the landing page and the privacy page.
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/JSR|coaching|english/i, { timeout: 30_000 });

    await page.goto(`${BASE_URL}/privacy`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/privacy/i, { timeout: 30_000 });
  });

  test("unauthenticated user should be redirected from protected pages", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });
});

// ============================================================
// ACCESSIBILITY
// ============================================================

test.describe("Accessibility", () => {
  test("login form should have proper labels", async ({ page }) => {
    await openLogin(page);

    await expect(page.locator('label[for="email"]')).toBeVisible();
    await expect(page.locator('label[for="password"]')).toBeVisible();
  });
});

// ============================================================
// SECURITY PROBES
// ============================================================

test.describe("Security Probes", () => {
  test("should handle SQL injection in email field", async ({ page }) => {
    await login(page, "' OR '1'='1", "password");

    await expect(page.getByTestId("login-email")).toBeVisible();
  });

  test("should not expose sensitive data in page source", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const html = await page.content();

    expect(html).not.toContain("service_role");
    expect(html).not.toContain("secret_key");
    expect(html).not.toContain("password_hash");
  });

  test("login page should load within 10 seconds", async ({ page }) => {
    const startTime = Date.now();
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("login-form")).toBeVisible({ timeout: 30_000 });
    expect(Date.now() - startTime).toBeLessThan(10_000);
  });
});
