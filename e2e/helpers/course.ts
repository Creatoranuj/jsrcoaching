import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Lesson cards (`data-testid="lesson-card"`) live on the *lecture listing*
 * screen — `/classes/:courseId/chapter/:chapterId` — not on
 * `/classes/:courseId/lessons`, which is the single-lesson player shell.
 * Walk the real navigation: chapters → first chapter → lecture list.
 */
export async function openFirstLessonList(page: Page, courseId: string): Promise<Locator> {
  await page.goto(`/classes/${courseId}/chapters`);

  const chapters = page.getByTestId("chapter-card");
  await expect(chapters.first()).toBeVisible({ timeout: 30_000 });
  await chapters.first().click();
  await expect(page).toHaveURL(/\/chapter\//, { timeout: 20_000 });

  const lessons = page.getByTestId("lesson-card");
  await expect(lessons.first()).toBeVisible({ timeout: 30_000 });
  return lessons;
}
