/**
 * Regression guard for the "PDF/image escapes to Chrome" class of bugs.
 *
 * Asserts that tapping a lesson-comment image attachment:
 *   1. Does NOT open a new browser tab / window (would signal `window.open`
 *      escaping the WebView).
 *   2. Mounts the in-app <DocReaderShell> overlay (data-testid).
 *   3. Browser/hardware Back closes ONLY the overlay — the student stays on
 *      the lesson (history sentinel via useOverlayBackClose). The Android
 *      twin of this check is maestro/overlay-back.yaml.
 *
 * Fixture: a lesson in E2E_COURSE_ID that has at least one comment with an
 * image. CI resolves E2E_LESSON_ID automatically in
 * `.github/scripts/e2e-preflight.mjs` (as the E2E student, so RLS applies);
 * when no such lesson exists the spec skips with that reason instead of
 * failing. The `page` event listener still runs in that case and catches any
 * accidental popup from earlier navigation, giving us a partial guard for free.
 *
 * The lesson player lives at `/classes/:courseId/lessons?lessonId=<id>`
 * (the `/lesson/:id` path is a legacy redirect to /dashboard, which is why
 * the previous version of this spec could never pass).
 *
 * Run:
 *   E2E_EMAIL=... E2E_PASSWORD=... E2E_COURSE_ID=... E2E_LESSON_ID=... \
 *     npx playwright test e2e/comment-image-in-app.spec.ts --project=chromium
 */
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
// Discovery may find the image comment in another course the student can
// open (free / enrolled); it then exports the matching course id as well.
const LESSON_ID = process.env.E2E_LESSON_ID;
const COURSE_ID = process.env.E2E_LESSON_COURSE_ID || process.env.E2E_COURSE_ID;

async function login(page: Page) {
  await signIn(page, EMAIL!, PASSWORD!);
  await expect(page).toHaveURL(/\/(dashboard|my-courses)/, { timeout: 20_000 });
}

test.describe("Comment image opens in-app", () => {
  test("tapping a comment image mounts DocReaderShell (no new tab)", async ({ page, context }) => {
    test.skip(!EMAIL || !PASSWORD || !COURSE_ID, "E2E_EMAIL / E2E_PASSWORD / E2E_COURSE_ID not set");
    test.skip(!LESSON_ID, "E2E_LESSON_ID not set — no lesson with an image comment visible to the E2E student");

    test.setTimeout(90_000);

    let popupOpened = false;
    context.on("page", () => { popupOpened = true; });

    await login(page);
    // `tab=comments` is the default chip, passed explicitly so a future
    // default change cannot silently turn this into a "no image" skip.
    await page.goto(`/classes/${COURSE_ID}/lessons?lessonId=${LESSON_ID}&tab=comments`);
    await expect(page).toHaveURL(new RegExp(`/classes/${COURSE_ID}/lessons`), { timeout: 20_000 });

    // Comments load after the lesson; the first image attachment is the target.
    const commentImage = page.locator('img[alt="Comment attachment"]').first();
    await expect(commentImage, `lesson ${LESSON_ID}: no image comment rendered`).toBeVisible({ timeout: 30_000 });
    // The attachment is lazy-loaded; clicking before the bitmap arrives can hit
    // a zero-height box.
    await commentImage
      .evaluate((el: HTMLImageElement) => (el.complete ? true : new Promise((r) => { el.onload = () => r(true); el.onerror = () => r(true); })))
      .catch(() => {});
    // Scroll the element's own scroll container (the page body used to be
    // `position: fixed` in landscape, which left the image permanently
    // "outside of the viewport" — see the LessonView landscape-lock fix).
    await commentImage.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" })).catch(() => {});
    await commentImage.scrollIntoViewIfNeeded().catch(() => {});
    await commentImage.click({ timeout: 20_000 });

    // In-app viewer must mount within a short window.
    const viewer = page.getByTestId("doc-reader-shell");
    await expect(viewer).toBeVisible({ timeout: 10_000 });

    // No popup / new tab should have been created.
    expect(popupOpened).toBe(false);
    expect(context.pages().length).toBe(1);

    // Back closes the overlay only. Without the sentinel this pops the lesson
    // route itself and the student lands on the dashboard (the pre-2026-09-23
    // behaviour on Android hardware Back).
    await page.goBack();
    await expect(viewer).toBeHidden({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`/classes/${COURSE_ID}/lessons`));
    await expect(page.getByRole("button", { name: "Open comment image" }).first()).toBeVisible({ timeout: 10_000 });
  });
});
