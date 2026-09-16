import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

/**
 * Critical-flow smoke tests. Run after every release candidate.
 *
 * Requires env:
 *   E2E_EMAIL    — test student account email
 *   E2E_PASSWORD — test student account password
 *
 * Skipped if creds not provided so CI can still run on PRs without secrets.
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe("smoke", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_EMAIL / E2E_PASSWORD not set");

  test("landing renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/JSR COACHING/i);
  });

  test("login flow succeeds", async ({ page }) => {
    await signIn(page, EMAIL!, PASSWORD!);
    await expect(page).toHaveURL(/\/(dashboard|my-courses)/, { timeout: 15_000 });
  });

  test("dashboard reachable after login", async ({ page }) => {
    await signIn(page, EMAIL!, PASSWORD!);
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText(/course|class|dashboard/i, {
      timeout: 10_000,
    });
  });

  test("subscription page loads payment CTA", async ({ page }) => {
    await signIn(page, EMAIL!, PASSWORD!);
    await page.goto("/subscription");
    await expect(page.getByRole("button", { name: /subscribe|pay|upgrade/i }).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test("chatbot widget opens", async ({ page }) => {
    await page.goto("/");
    const fab = page.locator('[aria-label*="chat" i], [data-testid="chat-fab"]').first();
    if (await fab.count()) {
      await fab.click();
      await expect(page.locator("text=/Safar Sarthi/i")).toBeVisible({ timeout: 5_000 });
    }
  });
});
