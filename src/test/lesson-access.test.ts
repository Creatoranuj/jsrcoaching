import { describe, it, expect } from "vitest";
import {
  canAccessLesson,
  checkCommentImage,
  normalizeLesson,
  normalizeLessons,
  MAX_COMMENT_IMAGE_BYTES,
} from "@/features/lesson/lib/access";

describe("canAccessLesson", () => {
  it("opens unlocked lessons to everyone", () => {
    expect(canAccessLesson({ is_locked: false } as any, false)).toBe(true);
  });

  it("keeps locked lessons shut without a purchase", () => {
    expect(canAccessLesson({ is_locked: true } as any, false)).toBe(false);
  });

  it("opens locked lessons after purchase", () => {
    expect(canAccessLesson({ is_locked: true } as any, true)).toBe(true);
  });

  it("treats a missing lock flag as unlocked", () => {
    expect(canAccessLesson({} as any, false)).toBe(true);
  });
});

describe("checkCommentImage", () => {
  it("accepts images at the limit", () => {
    expect(checkCommentImage({ size: MAX_COMMENT_IMAGE_BYTES })).toEqual({ ok: true });
  });
  it("rejects oversized images", () => {
    expect(checkCommentImage({ size: MAX_COMMENT_IMAGE_BYTES + 1 })).toEqual({
      ok: false,
      error: "Image must be under 5MB",
    });
  });
});

describe("normalizeLesson", () => {
  it("fills optional fields with empty string / null", () => {
    const l = normalizeLesson({ id: "1", title: "A" });
    expect(l.video_url).toBe("");
    expect(l.class_pdf_url).toBeNull();
    expect(l.overview).toBeNull();
    expect(l.lecture_type).toBeNull();
  });

  it("keeps provided values and preserves unknown keys", () => {
    const l = normalizeLesson({ id: "1", video_url: "u", lecture_type: "VIDEO", extra: 7 }) as any;
    expect(l.video_url).toBe("u");
    expect(l.lecture_type).toBe("VIDEO");
    expect(l.extra).toBe(7);
  });

  it("maps a list and tolerates null input", () => {
    expect(normalizeLessons(null)).toEqual([]);
    expect(normalizeLessons([{ id: "1" }, { id: "2" }]).length).toBe(2);
  });
});
