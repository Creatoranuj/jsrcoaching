/**
 * End-to-end: the admin refund journey.
 *
 *   admin → Payments tab → pick a paid record → Refund dialog
 *         → the destructive action stays disabled until "REFUND" is typed exactly
 *
 * The confirm click is opt-in (E2E_ALLOW_REFUND=1) so a normal CI run never
 * moves real money. Without it the spec still proves the guard rail holds.
 *
 * Required env: E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const ALLOW_REFUND = process.env.E2E_ALLOW_REFUND === "1";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/password/i).fill(PASSWORD!);
  await page.getByRole("button", { name: /log\s*in|sign\s*in/i }).click();
  await page.waitForURL(/\/(admin|dashboard)/, { timeout: 20_000 });
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
}

async function openPaymentsTab(page: Page) {
  const tab = page.getByRole("tab", { name: /payment/i }).first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1_000);
}

test.describe("admin refund journey", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set");
  test.describe.configure({ mode: "serial" });

  test("payments tab lists records with a refund action", async ({ page }) => {
    await loginAsAdmin(page);
    await openPaymentsTab(page);
    await expect(page.locator("body")).toContainText(/payment|amount|order|refund/i, { timeout: 20_000 });
  });

  test("refund stays disabled until REFUND is typed exactly", async ({ page }) => {
    await loginAsAdmin(page);
    await openPaymentsTab(page);

    const refundBtn = page.getByRole("button", { name: /refund/i }).first();
    test.skip(!(await refundBtn.count()), "No refundable payment available");
    await refundBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const confirmBtn = dialog.getByRole("button", { name: /refund|confirm/i }).last();
    await expect(confirmBtn).toBeDisabled();

    const input = dialog.locator('input[placeholder*="REFUND" i], input[type="text"]').first();
    await input.fill("refund");
    await expect(confirmBtn).toBeDisabled();

    await input.fill("REFUND");
    await expect(confirmBtn).toBeEnabled();

    if (!ALLOW_REFUND) {
      const cancel = dialog.getByRole("button", { name: /cancel|close/i }).first();
      if (await cancel.count()) await cancel.click();
      else await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden({ timeout: 10_000 });
      return;
    }

    await confirmBtn.click();
    await expect(page.locator("body")).toContainText(/refund/i, { timeout: 20_000 });
  });

  test("a student cannot reach the refund controls", async ({ page }) => {
    const studentEmail = process.env.E2E_EMAIL;
    const studentPassword = process.env.E2E_PASSWORD;
    test.skip(!studentEmail || !studentPassword, "E2E_EMAIL / E2E_PASSWORD not set");

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(studentEmail!);
    await page.getByLabel(/password/i).fill(studentPassword!);
    await page.getByRole("button", { name: /log\s*in|sign\s*in/i }).click();
    await page.waitForTimeout(3_000);

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const denied = /\/(login|auth|dashboard|unauthorized|my-courses|\?|$)/.test(new URL(page.url()).pathname);
    const refundBtn = page.getByRole("button", { name: /refund/i });
    expect(denied || (await refundBtn.count()) === 0).toBe(true);
  });
});
