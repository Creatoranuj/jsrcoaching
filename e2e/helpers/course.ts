import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Lesson cards (`data-testid="lesson-card"`) live on the *lecture listing*
 * screen — `/classes/:courseId/chapter/:chapterId` — not on
 * `/classes/:courseId/lessons`, which is the single-lesson player shell.
 *
 * Walk the real navigation the way a student does, with two facts about the
 * production catalogue baked in (both taken from a real CI failure snapshot):
 *
 *   1. The first chapter card is the synthetic "All Content" folder. Opening
 *      it renders *sub-chapter folders* ("PHYSICS : Physics 0 lectures", …),
 *      never lesson cards, so blindly clicking `.first()` can never pass.
 *   2. Several subjects legitimately have 0 lectures (empty containers for
 *      future batches). A card is only worth opening when its visible count
 *      is non-zero — "N lectures" on folder/gallery cards, "Lectures : d/N"
 *      on the list-mode ChapterCard.
 *
 * Whenever a screen shows folders instead of lessons, descend into the first
 * folder with lectures. Depth is bounded so a broken catalogue fails fast
 * with a clear message instead of a 30 s locator timeout.
 */
const HAS_LECTURES = /(?:^|\D)([1-9]\d*)\s+lectures?\b|Lectures\s*:\s*\d+\s*\/\s*([1-9]\d*)/i;
const MAX_DEPTH = 4;

async function firstCardWithLectures(cards: Locator): Promise<Locator | null> {
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const text = (await card.innerText().catch(() => "")) ?? "";
    if (/All Content/i.test(text)) continue;
    if (HAS_LECTURES.test(text)) return card;
  }
  return null;
}

export async function openFirstLessonList(page: Page, courseId: string): Promise<Locator> {
  await page.goto(`/classes/${courseId}/chapters`);

  const chapters = page.getByTestId("chapter-card");
  await expect(chapters.first()).toBeVisible({ timeout: 30_000 });
  // Counts arrive with the progress query a beat after the cards; poll until
  // at least one card advertises lectures rather than reading a "0" too early.
  await expect
    .poll(async () => (await firstCardWithLectures(chapters)) !== null, {
      timeout: 20_000,
      message: `course ${courseId}: no chapter card with a non-zero lecture count`,
    })
    .toBe(true);
  const chapter = (await firstCardWithLectures(chapters))!;
  await chapter.click();
  await expect(page).toHaveURL(/\/chapter\//, { timeout: 20_000 });

  const lessons = page.getByTestId("lesson-card");
  // Sub-chapter folders on the lecture-listing screen are plain buttons under
  // a "Chapters" heading; they carry the same "N lectures" caption.
  const folders = page.getByRole("button", { name: /\d+\s+lectures?\b/i });

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const outcome = await Promise.race([
      lessons.first().waitFor({ state: "visible", timeout: 30_000 }).then(() => "lessons" as const),
      folders.first().waitFor({ state: "visible", timeout: 30_000 }).then(() => "folders" as const),
    ]).catch(() => "none" as const);

    if (outcome === "lessons") return lessons;
    if (outcome === "none") break;

    // Folders rendered — a lesson list may still be filling in below them.
    if (await lessons.first().isVisible().catch(() => false)) return lessons;
    const next = await firstCardWithLectures(folders);
    if (!next) break;
    await next.click();
    await expect(page).toHaveURL(/\/chapter\//, { timeout: 20_000 });
  }

  await expect(lessons.first(), `course ${courseId}: reached a screen with no lesson cards`).toBeVisible({
    timeout: 10_000,
  });
  return lessons;
}
