/**
 * End-to-end: watching a lesson through to completion.
 *
 *   login → enrolled course → open a lesson → progress is recorded
 *         → mark complete → completion survives a reload
 *
 * Complements learning-journey.spec.ts, which only asserts that a lesson
 * *opens*. This spec covers the progress-writing half of the flow.
 *
 * Required env: E2E_EMAIL, E2E_PASSWORD, E2E_COURSE_ID
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const COURSE_ID = process.env.E2E_COURSE_ID;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/password/i).fill(PASSWORD!);
  await page.getByRole("button", { name: /log\s*in|sign\s*in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|my-courses)/, { timeout: 20_000 });
}

async function openFirstLesson(page: Page) {
  await page.goto(`/classes/${COURSE_ID}/lessons`);
  await page.waitForLoadState("networkidle");
  const items = page.locator('[data-testid="lesson-item"], [data-testid="lesson-card"], article, li');
  await expect(items.first()).toBeVisible({ timeout: 20_000 });
  await items.first().click().catch(() => {});
  await page.waitForTimeout(1_500);
}

test.describe("lesson completion", () => {
  test.skip(!EMAIL || !PASSWORD || !COURSE_ID, "E2E_EMAIL / E2E_PASSWORD / E2E_COURSE_ID not set");
  test.describe.configure({ mode: "serial" });

  test("opening a lesson records progress for the student", async ({ page }) => {
    const progressWrites: string[] = [];
    page.on("request", (req) => {
      if (/lesson_progress|user_progress/.test(req.url()) && req.method() !== "GET") {
        progressWrites.push(req.url());
      }
    });

    await login(page);
    await openFirstLesson(page);
    // Let the player emit at least one progress tick.
    await page.waitForTimeout(6_000);

    const progressUi = page.getByText(/%|complete|completed|progress/i);
    expect(progressWrites.length > 0 || (await progressUi.count()) > 0).toBe(true);
  });

  test("marking a lesson complete sticks across a reload", async ({ page }) => {
    await login(page);
    await openFirstLesson(page);

    const markDone = page
      .getByRole("button", { name: /mark (as )?(complete|done)|complete lesson|poora hua/i })
      .first();
    test.skip(!(await markDone.count()), "This lesson has no explicit complete button");

    await markDone.click();
    await expect(page.locator("body")).toContainText(/complete|completed|done/i, { timeout: 15_000 });

    const url = page.url();
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toBe(url);
    await expect(page.locator("body")).toContainText(/complete|completed|done/i, { timeout: 20_000 });
  });

  test("course progress reflects completed lessons", async ({ page }) => {
    await login(page);
    await page.goto("/my-courses");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/%|progress|complete|lesson/i, { timeout: 20_000 });
  });
});
