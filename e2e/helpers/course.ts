import { expect, type Page, type Locator } from "@playwright/test";
import { settleApp } from "./stall";

/**
 * Open the enrolled course's canonical "All Content" list and return its first
 * video lesson. This is the same student surface used for completion toggles.
 * It is intentionally more deterministic than walking chapter folders: a
 * parent can advertise descendant lessons while rendering only folders, and a
 * folder can contain documents but no playable lesson.
 */
export async function openFirstLessonList(page: Page, courseId: string): Promise<Locator> {
  // The selector below reads the full card's `aria-label` ("Lecture: <title>").
  // The compact list layout labels rows by title only and is remembered in
  // localStorage, so pin the card layout before the page boots.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb_lesson_view", "card");
    } catch {
      /* storage unavailable — the app falls back to the card layout anyway */
    }
  });
  await page.goto(`/my-courses/${courseId}?chapter=__all__`);
  await settleApp(page);

  const videoLessons = page.locator('[data-testid="lesson-card"][aria-label^="Lecture:"]');
  await expect(videoLessons.first(), `course ${courseId}: All Content has no playable lesson cards`).toBeVisible({
    timeout: 30_000,
  });
  return videoLessons;
}
