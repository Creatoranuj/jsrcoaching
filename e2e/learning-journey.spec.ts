/**
 * End-to-end: the core student journey.
 *
 *   login → courses → paid-course enrol gate → lesson opens → content loads
 *         → quiz attempt → result screen
 *
 * This is the flow that earns money and the one every release must not break.
 * Nothing here mutates payments: the paid path is asserted through the enrol
 * *gate* (an unenrolled student must not reach paid lesson content), and the
 * lesson/quiz legs run against an account that is already enrolled.
 *
 * Required env:
 *   E2E_EMAIL, E2E_PASSWORD   — a real student account
 * Optional env (each leg self-skips when missing):
 *   E2E_COURSE_ID             — course the account IS enrolled in
 *   E2E_PAID_COURSE_ID        — course the account is NOT enrolled in
 *   E2E_QUIZ_ID               — a quiz the account may attempt
 */
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { openFirstLesson } from "./helpers/lessons";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const COURSE_ID = process.env.E2E_COURSE_ID;
const PAID_COURSE_ID = process.env.E2E_PAID_COURSE_ID;
const QUIZ_ID = process.env.E2E_QUIZ_ID;

async function login(page: Page) {
  await signIn(page, EMAIL!, PASSWORD!);
  await expect(page).toHaveURL(/\/(dashboard|my-courses)/, { timeout: 20_000 });
}

test.describe("student journey", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_EMAIL / E2E_PASSWORD not set");
  test.describe.configure({ mode: "serial" });

  test("signed-out student cannot reach lesson content", async ({ page }) => {
    await page.goto(`/classes/${COURSE_ID ?? 1}/lessons`);
    // ProtectedRoute must bounce to the login screen, not render lessons.
    await expect(page).toHaveURL(/\/(login|auth)/, { timeout: 15_000 });
  });

  test("courses list renders after login", async ({ page }) => {
    await login(page);
    await page.goto("/courses");
    await expect(page.locator("body")).toContainText(/course|class|batch/i, {
      timeout: 15_000,
    });
  });

  test("unenrolled paid course shows the buy gate, not the lessons", async ({
    page,
  }) => {
    test.skip(!PAID_COURSE_ID, "E2E_PAID_COURSE_ID not set");
    await login(page);
    await page.goto(`/classes/${PAID_COURSE_ID}/lessons`);

    const gate = page.getByText(
      /enrol|enroll|buy|purchase|subscribe|access denied|not enrolled/i,
    );
    await expect
      .poll(
        async () => {
          const bounced =
            /\/(buy-course|course|courses|dashboard|subscription)/.test(
              new URL(page.url()).pathname,
            );
          return bounced || (await gate.count()) > 0;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  });

  test("enrolled course opens a lesson and loads its content", async ({
    page,
  }) => {
    test.skip(!COURSE_ID, "E2E_COURSE_ID not set");
    await login(page);

    // Chapter-organised courses show chapter folders first; the helper drills
    // through them and also tolerates builds that auto-open the first lesson.
    const opened = await openFirstLesson(page, COURSE_ID!);
    await expect(page.locator("body")).not.toContainText(
      /Lesson failed to load/i,
    );
    test.skip(!opened, "Configured E2E course has no lessons to open");

    const media = page.locator(
      'video, iframe, canvas, [data-testid="pdf-viewer"], [data-testid="video-player"]',
    );
    if (await media.count()) {
      await expect(media.first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test("quiz can be attempted and reaches a result", async ({ page }) => {
    test.skip(!QUIZ_ID, "E2E_QUIZ_ID not set");
    await login(page);
    await page.goto(`/quiz/${QUIZ_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // The app bounces away from /quiz/<id> (to /all-tests or /dashboard) when
    // the configured quiz isn't attemptable for this account — unpublished,
    // expired, already attempted, or not assigned. That's a config problem, not
    // an app bug: detect the bounce (it can take a few seconds, after the quiz
    // fetch resolves) and skip with a message naming the fix.
    const quizPath = () => new URL(page.url()).pathname;
    const deadline = Date.now() + 15_000;
    let bounced = false;
    while (Date.now() < deadline) {
      if (!/^\/quiz\//.test(quizPath())) {
        bounced = true;
        break;
      }
      // Quiz UI actually rendered → stop waiting and run the attempt.
      const ready = await page
        .locator("main")
        .first()
        .getByRole("button", {
          name: /^(next|submit quiz|start|begin|attempt)$/i,
        })
        .first()
        .isVisible()
        .catch(() => false);
      if (ready) break;
      await page.waitForTimeout(500);
    }
    test.skip(
      bounced,
      `Quiz ${QUIZ_ID} is not attemptable for the test account (redirected to ${quizPath()}) — update the E2E_QUIZ_ID secret`,
    );

    await expect(page.locator("body")).not.toContainText(
      /Quiz failed to load/i,
    );

    // Scope every control to the quiz surface. Unscoped /next/i also matched
    // the landing carousel's "Next banner" button, which then detached mid-click.
    const quiz = page.locator("main").first();

    const start = quiz
      .getByRole("button", { name: /^(start|begin|attempt)/i })
      .first();
    if (await start.count()) await start.click();

    // Answer whatever options are rendered, page by page.
    for (let step = 0; step < 25; step++) {
      const option = quiz
        .locator(
          'input[type="radio"], [role="radio"], [data-testid="quiz-option"]',
        )
        .first();
      if (await option.count())
        await option.click({ force: true }).catch(() => {});

      const next = quiz.getByRole("button", { name: /^next$/i }).first();
      const submit = quiz
        .getByRole("button", { name: /^submit quiz$|^submit$|^finish$/i })
        .first();
      if (await submit.count()) {
        await submit.click();
        break;
      }
      if (!(await next.count())) break;
      await next.click();
    }

    // Submit confirmation dialog.
    const confirm = page
      .getByRole("button", { name: /^(yes|confirm|submit)/i })
      .last();
    if (await confirm.count()) await confirm.click().catch(() => {});

    await expect(page).toHaveURL(/\/quiz\/.+\/result\/.+/, { timeout: 30_000 });

    await expect(page.locator("body")).toContainText(
      /score|result|correct|marks/i,
      {
        timeout: 15_000,
      },
    );
  });
});
