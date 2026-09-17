/**
 * Shared lesson-navigation helper.
 *
 * `/classes/:id/lessons` renders CHAPTER FOLDERS when a course is organised in
 * chapters, and lesson cards only *inside* a chapter. Specs used to assert
 * `lesson-card` on the course root, so every chapter-based course failed with
 * "element(s) not found". This helper drills through the first chapter folder
 * (a nested level too) until a lesson card exists, and tolerates builds that
 * auto-open the first lesson.
 */
import { expect, type Page } from "@playwright/test";

const LESSON_URL = /lessonId=|\/chapter\//;

/** Chapter folder rows render as buttons labelled "<n> lectures". */
function chapterFolders(page: Page) {
  return page.getByRole("button").filter({ hasText: /\d+\s+lectures?/i });
}

/** Opens the first available lesson of a course. Returns false if none exist. */
export async function openFirstLesson(
  page: Page,
  courseId: string,
): Promise<boolean> {
  await page.goto(`/classes/${courseId}/lessons`);
  if (/lessonId=/.test(page.url())) return true;

  for (let depth = 0; depth < 3; depth++) {
    const cards = page.getByTestId("lesson-card");
    const folders = chapterFolders(page);

    const state = await Promise.race([
      cards
        .first()
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => "cards" as const)
        .catch(() => "none" as const),
      folders
        .first()
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => "folders" as const)
        .catch(() => "none" as const),
    ]);

    if (state === "cards") {
      await cards.first().click();
      await expect(page).toHaveURL(LESSON_URL, { timeout: 20_000 });
      return true;
    }
    if (state === "folders") {
      await folders.first().click();
      await expect(page).toHaveURL(LESSON_URL, { timeout: 20_000 });
      continue;
    }
    return /lessonId=/.test(page.url());
  }
  return /lessonId=/.test(page.url());
}
