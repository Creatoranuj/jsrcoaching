/**
 * Regression guard for the "PDF/image escapes to Chrome" class of bugs.
 *
 * Asserts that tapping a lesson-comment image attachment:
 *   1. Does NOT open a new browser tab / window (would signal `window.open`
 *      escaping the WebView).
 *   2. Mounts the in-app <DocReaderShell> overlay (data-testid).
 *
 * The full flow requires a seeded lesson with an image comment, so the test
 * skips gracefully in CI runs that don't have E2E credentials. The `page`
 * event listener still runs in that case and catches any accidental popup
 * from earlier navigation, giving us a partial guard for free.
 *
 * Run:
 *   E2E_EMAIL=... E2E_PASSWORD=... E2E_LESSON_ID=... \
 *     npx playwright test e2e/comment-image-in-app.spec.ts --project=chromium
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const LESSON_ID = process.env.E2E_LESSON_ID;

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL!);
  await page.fill('input[type="password"]', PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 15000 });
}

test.describe("Comment image opens in-app", () => {
  test("tapping a comment image mounts DocReaderShell (no new tab)", async ({ page, context }) => {
    if (!EMAIL || !PASSWORD || !LESSON_ID) {
      test.skip(true, "E2E_EMAIL / E2E_PASSWORD / E2E_LESSON_ID not set");
    }

    let popupOpened = false;
    context.on("page", () => { popupOpened = true; });

    await login(page);
    await page.goto(`/lesson/${LESSON_ID}`);

    // Scroll to the comments section and pick the first image attachment.
    const commentImage = page.locator('img[alt="Comment attachment"]').first();
    await commentImage.waitFor({ state: "visible", timeout: 10000 });
    await commentImage.click();

    // In-app viewer must mount within a short window.
    await expect(page.getByTestId("doc-reader-shell")).toBeVisible({ timeout: 5000 });

    // No popup / new tab should have been created.
    expect(popupOpened).toBe(false);
    expect(context.pages().length).toBe(1);
  });
});