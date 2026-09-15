/**
 * Regression guard: every fullscreen reader/viewer that closes itself on
 * `popstate` must ignore synthetic pops.
 *
 * A nested overlay (autoscroll settings sheet, notes sheet) balances history
 * with `history.back()` when it closes. Without the `isSyntheticPop()` check
 * the reader underneath reads that as a hardware back press and closes the
 * PDF along with the sheet — the "Done closes my PDF" bug.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/components/course/StudyMaterialsList.tsx",
  "src/components/course/DocumentReader.tsx",
  "src/components/library/DocReaderShell.tsx",
  "src/components/notes/SmartNotesReader.tsx",
  "src/components/archive/ArchiveBookReader.tsx",
  "src/components/video/NotionPageRenderer.tsx",
];

describe("reader popstate listeners ignore synthetic pops", () => {
  it.each(FILES)("%s guards with isSyntheticPop()", (file) => {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(src).toContain("isSyntheticPop");
    expect(src).toMatch(/if \(isSyntheticPop\(\)\) return;/);
  });

  it.each([
    "src/components/library/DocReaderShell.tsx",
    "src/components/notes/SmartNotesReader.tsx",
    "src/components/archive/ArchiveBookReader.tsx",
  ])("%s marks its own cleanup pop as synthetic", (file) => {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(src).toMatch(/beginSyntheticPop\(\);\s*window\.history\.back\(\)/);
  });
});
