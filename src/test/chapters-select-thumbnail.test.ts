import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard: Subject icons on `/courses/:id` (ChapterView) and
 * `/my-courses/:courseId` (MyCourseDetail) render from `chapters.thumbnail_url`.
 * Bandwidth-trimming refactors have accidentally dropped this column from the
 * SELECT before (Jul 2026). This test fails loudly if it happens again.
 */
describe("chapters SELECT includes thumbnail_url", () => {
  const files = [
    "src/pages/MyCourseDetail.tsx",
    "src/pages/ChapterView.tsx",
  ];

  for (const rel of files) {
    it(`${rel} keeps thumbnail_url in chapters SELECT`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      // Grab every `.from("chapters").select("...")` string in the file.
      const re = /from\(\s*["']chapters["']\s*\)\s*\.select\(\s*["']([^"']+)["']/g;
      const matches = [...src.matchAll(re)];
      expect(matches.length, `no chapters SELECT found in ${rel}`).toBeGreaterThan(0);
      for (const m of matches) {
        const cols = m[1];
        // Allow the parent_id-only lookup in ChapterView (sub-chapters query).
        if (/^\s*id\s*,\s*parent_id\s*$/.test(cols)) continue;
        expect(cols, `thumbnail_url missing in chapters SELECT: "${cols}"`).toMatch(/thumbnail_url/);
      }
    });
  }
});
