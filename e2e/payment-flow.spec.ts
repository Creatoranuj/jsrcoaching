/**
 * JSR Coaching — E2E tests for the course purchase flow.
 *
 * Credentials and IDs come from CI secrets, never hardcoded:
 *   TEST_USER_EMAIL / TEST_USER_PASSWORD (falls back to E2E_EMAIL / E2E_PASSWORD)
 *     — a real student account.
 *   TEST_PAID_COURSE_ID (falls back to E2E_PAID_COURSE_ID) — a paid course.
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD — an account with the admin role.
 *
 * Everything that needs a login skips itself (never fails) when the matching
 * secret is absent. Admin legs are read-only: no payment is approved,
 * rejected or exported against live data by the test suite.
 */

import { test, expect, Page } from "@playwright/test";
import { signInAndLand } from "./helpers/auth";

const STUDENT = {
  email: process.env.TEST_USER_EMAIL || process.env.E2E_EMAIL || "",
  password: process.env.TEST_USER_PASSWORD || process.env.E2E_PASSWORD || "",
};

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || "",
  password: process.env.E2E_ADMIN_PASSWORD || "",
};

const PAID_COURSE_ID =
  process.env.TEST_PAID_COURSE_ID || process.env.E2E_PAID_COURSE_ID || "";

const HAS_STUDENT = !!(STUDENT.email && STUDENT.password);
const HAS_ADMIN = !!(ADMIN.email && ADMIN.password);

async function login(page: Page, email: string, password: string) {
  // signInAndLand waits for the post-login route with a 30s budget and reports
  // the inline error on failure; the old bare 20s toHaveURL made this flaky in
  // CI whenever AuthContext booted slowly (run 35504201896).
  await signInAndLand(page, email, password, /\/(dashboard|my-courses|admin)/);
}

// ============================================================
// PUBLIC / GUARD BEHAVIOUR (no credentials needed)
// ============================================================

test.describe("Purchase route guards", () => {
  test("signed-out visitor cannot reach the courses list", async ({ page }) => {
    await page.goto("/courses");
    await expect(page).toHaveURL(/\/(login|auth)/, { timeout: 15_000 });
  });

  test("signed-out visitor cannot reach the buy screen", async ({ page }) => {
    await page.goto("/buy-course");
    await expect(page).toHaveURL(/\/(login|auth)/, { timeout: 15_000 });
  });
});

// ============================================================
// STUDENT FLOW (read-only)
// ============================================================

test.describe("Student purchase screens", () => {
  test.skip(!HAS_STUDENT, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  test("courses list renders for a signed-in student", async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await page.goto("/courses");
    await expect(page.locator("body")).toContainText(/course|class|batch/i, {
      timeout: 20_000,
    });
  });

  test("buy screen renders for a paid course", async ({ page }) => {
    test.skip(!PAID_COURSE_ID, "TEST_PAID_COURSE_ID / E2E_PAID_COURSE_ID not set");

    await login(page, STUDENT.email, STUDENT.password);
    await page.goto(`/buy-course?id=${encodeURIComponent(PAID_COURSE_ID)}`);

    await expect(page.locator("body")).toContainText(
      /pay|price|₹|enrol|enroll|buy|purchase|subscribe/i,
      { timeout: 20_000 },
    );
  });

  test("a price is shown on the buy screen", async ({ page }) => {
    test.skip(!PAID_COURSE_ID, "TEST_PAID_COURSE_ID / E2E_PAID_COURSE_ID not set");

    await login(page, STUDENT.email, STUDENT.password);
    await page.goto(`/buy-course?id=${encodeURIComponent(PAID_COURSE_ID)}`);

    await expect(page.locator("body")).not.toContainText(/Course not found/i, { timeout: 20_000 });
    // The buy screen renders "Loading…" first; poll instead of reading once.
    await expect
      .poll(async () => (await page.locator("body").textContent()) ?? "", { timeout: 20_000 })
      .toMatch(/[₹]|Rs\.?\s*\d|\bfree\b/i);
  });

  test("student cannot reach the admin panel", async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await page.goto("/admin");
    await page.waitForURL((url) => url.pathname !== "/admin", { timeout: 15_000 }).catch(() => {});

    // A non-admin is either shown a denial screen or bounced away — both count.
    const bounced = /\/(login|dashboard|my-courses)/.test(page.url());
    if (!bounced) {
      await expect(
        page
          .locator("text=/Access Denied|not authorized|Unauthorized|admin login/i")
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    }
  });
});

// ============================================================
// ADMIN FLOW (read-only; skips without an admin secret)
// ============================================================

test.describe("Admin payment review", () => {
  test.skip(!HAS_ADMIN, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");

  test("admin panel opens", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin");
    await expect(page.locator("body")).toContainText(/admin|dashboard/i, {
      timeout: 20_000,
    });
  });

  test("payments screen lists payment state without mutating it", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin");

    await expect(page.locator("body")).toContainText(
      /payment|pending|approved|transaction/i,
      { timeout: 20_000 },
    );
  });
});
