import { describe, it, expect } from "vitest";
import {
  LESSON_FEATURE_KEYS,
  LESSON_FEATURE_DEFAULTS,
  parseLessonFeatureRows,
} from "@/hooks/useLessonFeatureFlags";
import { buildLessonChips } from "@/features/lesson/lib/lessonChips";

const base = { hasNotes: true, isAdminOrTeacher: false, hasLiked: false, likeCount: 0 };

describe("parseLessonFeatureRows", () => {
  it("defaults every flag to ON when no rows exist", () => {
    expect(parseLessonFeatureRows([])).toEqual(LESSON_FEATURE_DEFAULTS);
  });

  it("treats false-ish text values as OFF", () => {
    const flags = parseLessonFeatureRows([
      { key: LESSON_FEATURE_KEYS.chipAskDoubt, value: "false" },
      { key: LESSON_FEATURE_KEYS.chipBookmarks, value: "0" },
      { key: LESSON_FEATURE_KEYS.pdfDownload, value: "off" },
    ]);
    expect(flags.chipAskDoubt).toBe(false);
    expect(flags.chipBookmarks).toBe(false);
    expect(flags.pdfDownload).toBe(false);
    expect(flags.chipComments).toBe(true);
  });

  it("accepts true/1/on/yes as ON and ignores case and spaces", () => {
    const flags = parseLessonFeatureRows([
      { key: LESSON_FEATURE_KEYS.chipLike, value: " TRUE " },
      { key: LESSON_FEATURE_KEYS.chipRating, value: "Yes" },
      { key: LESSON_FEATURE_KEYS.chipStrip, value: "1" },
    ]);
    expect(flags.chipLike).toBe(true);
    expect(flags.chipRating).toBe(true);
    expect(flags.chipStrip).toBe(true);
  });

  it("treats a null value as ON (unset setting)", () => {
    const flags = parseLessonFeatureRows([{ key: LESSON_FEATURE_KEYS.chipMentors, value: null }]);
    expect(flags.chipMentors).toBe(true);
  });
});

describe("buildLessonChips with flags", () => {
  it("keeps every chip when no flags are passed", () => {
    expect(buildLessonChips(base).map((c) => c.id)).toContain("ask-doubt");
  });

  it("drops chips whose flag is false", () => {
    const ids = buildLessonChips({
      ...base,
      flags: { chipAskDoubt: false, chipMyDoubts: false, chipBookmarks: false },
    }).map((c) => c.id);
    expect(ids).not.toContain("ask-doubt");
    expect(ids).not.toContain("my-doubts");
    expect(ids).not.toContain("bookmarks");
    expect(ids).toContain("comments");
  });

  it("keeps chips whose flag is true or missing", () => {
    const ids = buildLessonChips({ ...base, flags: { chipLike: true } }).map((c) => c.id);
    expect(ids).toContain("like");
    expect(ids).toContain("rating");
  });
});
