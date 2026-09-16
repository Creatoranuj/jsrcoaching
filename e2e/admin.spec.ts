/**
 * JSR Coaching — E2E tests for the admin panel.
 *
 * Admin credentials come from CI secrets:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD — an account holding the admin role.
 *
 * Without them every admin-only block skips cleanly instead of burning the
 * job's 25-minute budget on retried login timeouts.
 */

import { test, expect, Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

const ADMIN_USER = {
  email: process.env.E2E_ADMIN_EMAIL || "",
  password: process.env.E2E_ADMIN_PASSWORD || "",
};

const HAS_ADMIN = !!(ADMIN_USER.email && ADMIN_USER.password);
const SKIP_REASON = "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set";

async function loginAsAdmin(page: Page) {
  await signIn(page, ADMIN_USER.email, ADMIN_USER.password);
  await page.waitForURL(/\/(dashboard|admin|my-courses)/, { timeout: 20_000 });
}

// ============================================================
// PUBLIC GUARD CHECKS (no credentials needed)
// ============================================================

test.describe("Admin route guards", () => {
  test("unauthenticated user should be redirected", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`);
    await expect(page).toHaveURL(/\/(login|admin\/login)/, { timeout: 15_000 });
  });
});

// ============================================================
// ADMIN DASHBOARD
// ============================================================

test.describe("Admin Dashboard", () => {
  test.skip(!HAS_ADMIN, SKIP_REASON);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
  });

  test("should display admin dashboard", async ({ page }) => {
    await expect(page.locator("text=/Admin/i").first()).toBeVisible({ timeout: 15_000 });
  });

  test("should have a single top-level heading", async ({ page }) => {
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("should not expose sensitive data in responses", async ({ page }) => {
    const html = await page.content();

    expect(html).not.toContain("password_hash");
    expect(html).not.toContain("service_role");
  });
});

// ============================================================
// COURSE + USER MANAGEMENT (read-only assertions)
// ============================================================

test.describe("Admin management screens", () => {
  test.skip(!HAS_ADMIN, SKIP_REASON);

  test("courses screen lists courses", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
    await page.locator("text=/Courses/i").first().click();

    await expect(page.locator("text=/Course/i").first()).toBeVisible({ timeout: 15_000 });
  });

  test("users screen lists users", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
    await page.locator("text=/Users/i").first().click();

    await expect(page.locator("text=/Role|Student|Admin/i").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
