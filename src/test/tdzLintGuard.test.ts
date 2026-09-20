import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ESLint } from "eslint";

/**
 * Regression guard for Sentry SAFAR-ENGLISH-APP-18:
 *   ReferenceError: Cannot access 'Er' before initialization   (LessonView)
 *
 * A `useCallback(..., [reportLessonProgress])` deps array read a `const` that
 * was declared a few lines LOWER in the same component body. Dev builds
 * happened to survive; the minified bundle threw on every lesson open.
 *
 * Layer 1: eslint.config.js must keep `@typescript-eslint/no-use-before-define`
 *          at "error" (same-scope reads only, `variables: false`).
 * Layer 2: the historically affected pages must lint clean for that rule.
 */

const ROOT = resolve(__dirname, "../..");
const RULE = "@typescript-eslint/no-use-before-define";

describe("TDZ lint guard", () => {
  it("eslint config keeps no-use-before-define as an error", () => {
    const cfg = readFileSync(resolve(ROOT, "eslint.config.js"), "utf8");
    expect(cfg).toMatch(/"@typescript-eslint\/no-use-before-define":\s*\[\s*"error"/);
    expect(cfg).toMatch(/variables:\s*false/);
  });

  it("pages that crashed before lint clean for same-scope use-before-define", async () => {
    const eslint = new ESLint({
      cwd: ROOT,
      overrideConfigFile: resolve(ROOT, "eslint.config.js"),
    });
    const files = [
      "src/pages/LessonView.tsx",
      "src/pages/AdminQuizManager.tsx",
      "src/pages/BuyCourse.tsx",
      "src/pages/PayBrowser.tsx",
      "src/pages/MyCourses.tsx",
    ].map((f) => resolve(ROOT, f));
    const results = await eslint.lintFiles(files);
    const hits = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === RULE)
        .map((m) => `${r.filePath.replace(ROOT + "/", "")}:${m.line}:${m.column} ${m.message}`),
    );
    expect(hits).toEqual([]);
  }, 60_000);

  it("LessonView declares useLessonProgress before handleVideoTimeUpdate", () => {
    const src = readFileSync(resolve(ROOT, "src/pages/LessonView.tsx"), "utf8");
    const hookIdx = src.indexOf("useLessonProgress(currentLesson?.id");
    const cbIdx = src.indexOf("const handleVideoTimeUpdate = useCallback(");
    expect(hookIdx).toBeGreaterThan(-1);
    expect(cbIdx).toBeGreaterThan(-1);
    expect(hookIdx).toBeLessThan(cbIdx);
    // Stray imports after the component body are another TDZ/bundle-order smell.
    const lastImport = src.lastIndexOf("\nimport ");
    const componentStart = src.indexOf("const LessonView");
    expect(lastImport).toBeLessThan(componentStart);
  });
});
