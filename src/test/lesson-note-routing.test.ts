import { describe, expect, it } from "vitest";
import { shouldAutoOpenSinglePdfNote } from "@/lib/lessonNoteRouting";

const pdfNote = { kind: "pdf" };
const imageNote = { kind: "image" };

describe("lesson note drawer routing", () => {
  it("keeps video lessons in the drawer even with one PDF note", () => {
    expect(shouldAutoOpenSinglePdfNote("VIDEO", [pdfNote])).toBe(false);
  });

  it("auto-opens true standalone single-PDF document lessons", () => {
    expect(shouldAutoOpenSinglePdfNote("PDF", [pdfNote])).toBe(true);
    expect(shouldAutoOpenSinglePdfNote("NOTES", [pdfNote])).toBe(true);
    expect(shouldAutoOpenSinglePdfNote("DPP", [pdfNote])).toBe(true);
  });

  it("keeps every multi-file lesson in the drawer", () => {
    expect(shouldAutoOpenSinglePdfNote("PDF", [pdfNote, pdfNote])).toBe(false);
    expect(shouldAutoOpenSinglePdfNote("VIDEO", [pdfNote, pdfNote])).toBe(false);
  });

  it("keeps non-PDF single notes in the drawer", () => {
    expect(shouldAutoOpenSinglePdfNote("PDF", [imageNote])).toBe(false);
  });
});
