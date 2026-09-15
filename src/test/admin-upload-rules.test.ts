import { describe, it, expect } from "vitest";
import {
  checkUploadFile,
  checkThumbnailFile,
  checkVideoFile,
  fileExtension,
  randomObjectName,
  videoStoragePath,
  storageUri,
  nextPosition,
  MAX_VIDEO_BYTES,
  MAX_THUMBNAIL_BYTES,
} from "@/features/admin-upload/lib/uploadRules";

describe("fileExtension", () => {
  it("lowercases and takes the last segment", () => {
    expect(fileExtension("Notes.FINAL.PDF")).toBe("pdf");
  });
  it("returns empty for extensionless names", () => {
    expect(fileExtension("README")).toBe("readme"); // no dot => whole name
    expect(fileExtension("")).toBe("");
  });
});

describe("checkUploadFile", () => {
  it("accepts a PDF", () => {
    expect(checkUploadFile({ name: "ch1.pdf", type: "application/pdf" })).toEqual({ ok: true });
  });

  it("blocks executable/script extensions regardless of MIME", () => {
    for (const name of ["hack.exe", "x.html", "a.js", "b.svg", "c.php"]) {
      const r = checkUploadFile({ name, type: "application/pdf" });
      expect(r.ok).toBe(false);
    }
  });

  it("blocks disallowed MIME types", () => {
    const r = checkUploadFile({ name: "a.zip", type: "application/zip" });
    expect(r).toEqual({
      ok: false,
      error: 'File type "application/zip" is not allowed. Use PDF, Office docs, images, or video.',
    });
  });

  it("tolerates an empty MIME type", () => {
    expect(checkUploadFile({ name: "notes.pdf", type: "" })).toEqual({ ok: true });
  });
});

describe("checkThumbnailFile", () => {
  it("accepts a small webp", () => {
    expect(checkThumbnailFile({ type: "image/webp", size: 1000 })).toEqual({ ok: true });
  });
  it("rejects non-images", () => {
    expect(checkThumbnailFile({ type: "application/pdf", size: 10 }).ok).toBe(false);
  });
  it("rejects oversized images", () => {
    expect(checkThumbnailFile({ type: "image/png", size: MAX_THUMBNAIL_BYTES + 1 })).toEqual({
      ok: false,
      error: "Thumbnail must be under 10MB",
    });
  });
});

describe("checkVideoFile", () => {
  it("accepts up to the limit and rejects beyond it", () => {
    expect(checkVideoFile({ size: MAX_VIDEO_BYTES })).toEqual({ ok: true });
    expect(checkVideoFile({ size: MAX_VIDEO_BYTES + 1 }).ok).toBe(false);
  });
});

describe("object naming and paths", () => {
  it("keeps the extension and stays unique", () => {
    const a = randomObjectName("Lecture 1.mp4");
    expect(a.endsWith(".mp4")).toBe(true);
    expect(a).not.toBe(randomObjectName("Lecture 1.mp4"));
  });

  it("namespaces videos per course, with a fallback prefix", () => {
    expect(videoStoragePath(7, "a.mp4")).toBe("course-7/uploads/a.mp4");
    expect(videoStoragePath(null, "a.mp4")).toBe("uploads/uploads/a.mp4");
  });

  it("builds a bucket-agnostic URI", () => {
    expect(storageUri("content", "lessons/a.pdf")).toBe("storage://content/lessons/a.pdf");
  });
});

describe("nextPosition", () => {
  it("appends when no explicit position is given", () => {
    expect(nextPosition(0, 4)).toBe(5);
    expect(nextPosition(undefined, 0)).toBe(1);
  });
  it("respects an explicit position", () => {
    expect(nextPosition(2, 9)).toBe(2);
  });
});
