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
 */

import { test, expect, Page } from "@playwright/test";

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

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

// ============================================================
// PUBLIC FORM BEHAVIOUR (no credentials needed)
// ============================================================

test.describe("Authentication Flow", () => {
  test.describe("Login Page", () => {
    test("should display login form", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);

      await expect(page.locator("text=Welcome Back")).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test("should show error for empty fields", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.click('button[type="submit"]');

      await expect(page.locator("text=Please fill in all fields")).toBeVisible();
    });

    test("should show error for invalid credentials", async ({ page }) => {
      await login(page, "wrong@email.com", "wrongpassword");

      await expect(page.locator("text=Invalid").first()).toBeVisible({ timeout: 10_000 });
    });

    test("should toggle password visibility", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);

      const passwordInput = page.locator('input[id="password"]');
      await expect(passwordInput).toHaveAttribute("type", "password");

      await page.locator('button:has(svg)').first().click();
      await expect(page.locator('input[id="password"]')).toHaveAttribute("type", "text");
    });

    test("should navigate to signup page", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.click("text=Create account");

      await expect(page).toHaveURL(/\/signup/);
    });
  });

  test.describe("Signup Page", () => {
    test("should display signup form", async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);

      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test("should show error for existing email", async ({ page }) => {
      test.skip(!HAS_USER, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

      await page.goto(`${BASE_URL}/signup`);
      await page.fill('input[id="fullName"]', "Existing User");
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', "password123");
      await page.click('button[type="submit"]');

      await expect(
        page.locator("text=/already registered|already exists|already in use/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});

// ============================================================
// AUTHENTICATED FLOWS (student account)
// ============================================================

test.describe("Authenticated student", () => {
  test.skip(!HAS_USER, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  test("should redirect to dashboard on successful login", async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);
    await expect(page).toHaveURL(/\/(dashboard|my-courses)/, { timeout: 20_000 });
  });

  test("should maintain session across page refresh", async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);
    await expect(page).toHaveURL(/\/(dashboard|my-courses)/, { timeout: 20_000 });

    await page.reload();
    await expect(page).toHaveURL(/\/(dashboard|my-courses)/);
  });

  test("student should not reach the admin panel", async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);
    await expect(page).toHaveURL(/\/(dashboard|my-courses)/, { timeout: 20_000 });

    await page.goto(`${BASE_URL}/admin`);
    await expect(
      page.locator("text=/Access Denied|not authorized|Unauthorized/i").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("dashboard should load within 15 seconds after login", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);

    const startTime = Date.now();
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|my-courses)/, { timeout: 20_000 });

    expect(Date.now() - startTime).toBeLessThan(15_000);
  });
});

test.describe("Authenticated admin", () => {
  test.skip(!HAS_ADMIN, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");

  test("admin should access admin panel", async ({ page }) => {
    await login(page, ADMIN_USER.email, ADMIN_USER.password);
    await page.goto(`${BASE_URL}/admin`);

    await expect(page.locator("text=/Admin/i").first()).toBeVisible({ timeout: 15_000 });
  });
});

// ============================================================
// NAVIGATION
// ============================================================

test.describe("Navigation", () => {
  test("unauthenticated user should access public pages", async ({ page }) => {
    await page.goto(`${BASE_URL}/courses`);
    await expect(page.locator("text=/Courses/i").first()).toBeVisible();

    await page.goto(`${BASE_URL}/books`);
    await expect(page.locator("text=/Books/i").first()).toBeVisible();
  });

  test("unauthenticated user should be redirected from protected pages", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

// ============================================================
// ACCESSIBILITY
// ============================================================

test.describe("Accessibility", () => {
  test("login form should have proper labels", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await expect(page.locator('label[for="email"]')).toBeVisible();
    await expect(page.locator('label[for="password"]')).toBeVisible();
  });
});

// ============================================================
// SECURITY PROBES
// ============================================================

test.describe("Security Probes", () => {
  test("should handle SQL injection in email field", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', "' OR '1'='1");
    await page.fill('input[type="password"]', "password");
    await page.click('button[type="submit"]');

    await expect(page.locator('input[id="email"]')).toBeVisible();
  });

  test("should not expose sensitive data in page source", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    const html = await page.content();

    expect(html).not.toContain("service_role");
    expect(html).not.toContain("secret_key");
    expect(html).not.toContain("password_hash");
  });

  test("login page should load within 5 seconds", async ({ page }) => {
    const startTime = Date.now();
    await page.goto(`${BASE_URL}/login`);
    expect(Date.now() - startTime).toBeLessThan(5000);
  });
});
