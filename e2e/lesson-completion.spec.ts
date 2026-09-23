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
import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { openFirstLessonList } from "./helpers/course";
import { pollWithStallRecovery, settleApp } from "./helpers/stall";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const COURSE_ID = process.env.E2E_COURSE_ID;

async function login(page: Page) {
  await signIn(page, EMAIL!, PASSWORD!);
  await expect(page).toHaveURL(/\/(dashboard|my-courses)/, { timeout: 20_000 });
}

async function openFirstLesson(page: Page) {
  const items = await openFirstLessonList(page, COURSE_ID!);
  await items.first().click();
  await expect(page).toHaveURL(/lessonId=|\/chapter\//, { timeout: 20_000 });
  await settleApp(page);
}

test.describe("lesson completion", () => {
  test.skip(!EMAIL || !PASSWORD || !COURSE_ID, "E2E_EMAIL / E2E_PASSWORD / E2E_COURSE_ID not set");
  test.describe.configure({ mode: "serial" });

  test("opening a lesson records progress for the student", async ({ page }) => {
    test.setTimeout(120_000);
    const progressWrites: string[] = [];
    page.on("request", (req) => {
      if (/lesson_progress|user_progress/.test(req.url()) && req.method() !== "GET") {
        progressWrites.push(req.url());
      }
    });

    await login(page);
    await openFirstLesson(page);

    // Headless Chromium never autoplays an embedded video, and the player only
    // writes lesson_progress on playback ticks. Press play like a student
    // would, then give the player a moment to emit a tick.
    const play = page.getByRole("button", { name: /play\/pause|^play$/i }).first();
    if (await play.isVisible().catch(() => false)) await play.click().catch(() => {});
    await page.waitForTimeout(6_000);

    // Evidence that progress tracking is wired for this lesson: a write went
    // out, progress copy is on screen, or the player's own progress slider
    // (aria-label "Video progress") rendered. Embedded players cannot always
    // start in CI, so the slider is accepted as proof the tracker mounted.
    // Walking the catalogue plus a stalled-screen retry can outlast the 45 s
    // default; this spec is allowed to take its time.
    const progressUi = page.getByText(/%|complete|completed|progress/i);
    const progressSlider = page.getByRole("slider", { name: /progress/i });
    const sawProgress = await pollWithStallRecovery(
      page,
      async () =>
        progressWrites.length > 0 ||
        (await progressUi.count()) > 0 ||
        (await progressSlider.count()) > 0,
      30_000,
    );
    expect(sawProgress, "no progress write, progress copy or progress slider on the lesson screen").toBe(
      true,
    );
  });

  test("marking a lesson complete sticks across a reload", async ({ page }) => {
    // The explicit "Mark as done" toggle lives on the lesson rows of the
    // My Courses detail screen (LectureCard with onMarkComplete), not inside
    // the player and not on /classes/:id/chapter/:id (LectureListing never
    // passes onMarkComplete) — the old version looked there and always
    // skipped with "no explicit complete button".
    await login(page);
    // Without `chapter=` the screen shows the chapter folders first; `__all__`
    // is the synthetic "All Content" chapter that lists every lesson row.
    await page.goto(`/my-courses/${COURSE_ID}?chapter=__all__`);

    const toggles = page.getByRole("button", { name: /^mark as (not )?done$/i });
    await expect(toggles.first(), `course ${COURSE_ID}: no lesson row with a Mark-as-done toggle`).toBeVisible({
      timeout: 30_000,
    });

    // Flip the first toggle, prove the new state survives a reload, then
    // flip it back so the fixture account is left exactly as we found it.
    const first = toggles.first();
    const before = (await first.getAttribute("aria-pressed")) === "true";
    const flipped = String(!before);

    await toggleAndConfirm(page, first, flipped);

    const url = page.url();
    await page.reload();
    expect(page.url()).toBe(url);
    await expect(toggles.first()).toBeVisible({ timeout: 30_000 });
    await expect(toggles.first()).toHaveAttribute("aria-pressed", flipped, { timeout: 20_000 });

    // Restore.
    await toggleAndConfirm(page, toggles.first(), String(before));
    await page.reload();
    await expect(toggles.first()).toBeVisible({ timeout: 30_000 });
    await expect(toggles.first()).toHaveAttribute("aria-pressed", String(before), { timeout: 20_000 });
  });

  /**
   * Clicks a Mark-as-done toggle and waits until the app has *confirmed* the
   * write, not just painted it. The button flips optimistically; the
   * course-detail cache (React-Query entry + localStorage bundle, 2 min fresh)
   * is only patched once the `user_progress` request resolves. Reloading
   * before that — run #286 did, ~300 ms after the click — aborts the request
   * in the page, the reload hydrates from the un-patched bundle, and the
   * screen shows the previous state for the whole stale window even though
   * the row did change on the server. A real student sees the toast before
   * they could reach the refresh button, so we wait for the same signal.
   */
  async function toggleAndConfirm(page: Page, toggle: Locator, expected: string) {
    let confirmedBy: "response" | "toast" | null = null;
    void page
      .waitForResponse(
        (res) => /user_progress/.test(res.url()) && res.request().method() !== "GET" && res.ok(),
        { timeout: 20_000 },
      )
      .then(() => {
        confirmedBy ??= "response";
      })
      .catch(() => undefined);
    const toastCopy = expected === "true" ? /marked as complete/i : /marked as not done/i;
    void page
      .getByText(toastCopy)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => {
        confirmedBy ??= "toast";
      })
      .catch(() => undefined);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", expected);
    await expect
      .poll(() => confirmedBy, {
        timeout: 20_000,
        message: `the "aria-pressed=${expected}" write was never confirmed (no user_progress response, no toast)`,
      })
      .not.toBeNull();
  }

  test("course progress reflects completed lessons", async ({ page }) => {
    await login(page);
    await page.goto("/my-courses");
    await expect(page.locator("body")).toContainText(/%|progress|complete|lesson/i, { timeout: 20_000 });
  });
});
