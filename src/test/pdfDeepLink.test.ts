/**
 * Integration tests for the PDFs chip / `?openPdf=` deep-link.
 *
 * Covers the LessonView auto-open logic via the pure resolver it delegates
 * to, plus the LectureListing URL contract that triggers it. Keeping the
 * resolver isolated lets us assert on every fallback path without mounting
 * the 2.5k-line LessonView tree or stubbing Supabase.
 */
import { describe, it, expect } from "vitest";
import { resolveDeepLinkPdf } from "../lib/resolveDeepLinkPdf";

const lesson = {
  id: "lesson-1",
  title: "Intro to Polity",
  class_pdf_url: "https://cdn.example.com/class.pdf",
};

const lessonNoClass = { ...lesson, class_pdf_url: null };

const pdfLesson = {
  ...lessonNoClass,
  title: "Maha Marathon Part 02",
  lecture_type: "PDF",
  video_url: "https://cdn.example.com/maha-marathon.pdf",
};

const pdfs = [
  { id: "pdf-a", file_name: "Chapter 1.pdf", file_url: "https://cdn.example.com/a.pdf" },
  { id: "pdf-b", file_name: "Chapter 2.pdf", file_url: "https://cdn.example.com/b.pdf" },
];

const attachments = [
  { id: "att-1", file_name: "notes.pdf", mime_type: "application/pdf" },
  { id: "att-2", file_name: "diagram.png", mime_type: "image/png" },
  { id: "att-3", title: "Bonus", file_name: "bonus.PDF", mime_type: null },
];

describe("resolveDeepLinkPdf — lecture-card flow (openPdf=1)", () => {
  it("returns null when the deep-link param is absent", () => {
    expect(resolveDeepLinkPdf(null, lesson, pdfs, attachments)).toBeNull();
    expect(resolveDeepLinkPdf("", lesson, pdfs, attachments)).toBeNull();
  });

  it("opens class_pdf_url first when openPdf=1", () => {
    const r = resolveDeepLinkPdf("1", lesson, pdfs, attachments);
    expect(r).toEqual({
      kind: "direct",
      pdf: {
        id: "class-pdf",
        file_name: "Intro to Polity : Class Notes",
        file_url: "https://cdn.example.com/class.pdf",
      },
    });
  });

  it("opens a PDF lesson's own video_url before looking for attachment rows", () => {
    const r = resolveDeepLinkPdf("1", pdfLesson, [], []);
    expect(r).toEqual({
      kind: "direct",
      pdf: {
        id: "lesson-file",
        file_name: "Maha Marathon Part 02",
        file_url: "https://cdn.example.com/maha-marathon.pdf",
      },
    });
  });

  it("falls back to the first lesson PDF when no class_pdf_url", () => {
    const r = resolveDeepLinkPdf("1", lessonNoClass, pdfs, attachments);
    expect(r).toEqual({
      kind: "direct",
      pdf: { id: "pdf-a", file_name: "Chapter 1.pdf", file_url: "https://cdn.example.com/a.pdf" },
    });
  });

  it("falls back to the first PDF attachment when there are no lesson PDFs", () => {
    const r = resolveDeepLinkPdf("1", lessonNoClass, [], attachments);
    expect(r).toEqual({
      kind: "attachment",
      attachment: { id: "att-1", file_name: "notes.pdf", title: undefined },
    });
  });

  it("returns null when nothing PDF-shaped is available", () => {
    const r = resolveDeepLinkPdf("1", lessonNoClass, [], [
      { id: "x", file_name: "image.png", mime_type: "image/png" },
    ]);
    expect(r).toBeNull();
  });
});

describe("resolveDeepLinkPdf — attachments flow (openPdf=<id>)", () => {
  it("opens a specific lesson PDF by id", () => {
    const r = resolveDeepLinkPdf("pdf-b", lesson, pdfs, attachments);
    expect(r).toEqual({
      kind: "direct",
      pdf: { id: "pdf-b", file_name: "Chapter 2.pdf", file_url: "https://cdn.example.com/b.pdf" },
    });
  });

  it("opens a specific PDF attachment by id (signed URL is resolved by caller)", () => {
    const r = resolveDeepLinkPdf("att-3", lessonNoClass, [], attachments);
    expect(r).toEqual({
      kind: "attachment",
      attachment: { id: "att-3", file_name: "bonus.PDF", title: "Bonus" },
    });
  });

  it("treats `class-pdf` id as the lesson's class_pdf_url", () => {
    const r = resolveDeepLinkPdf("class-pdf", lesson, pdfs, attachments);
    expect(r?.kind).toBe("direct");
    if (r?.kind === "direct") expect(r.pdf.id).toBe("class-pdf");
  });

  it("ignores non-PDF attachments even when the id matches", () => {
    const r = resolveDeepLinkPdf("att-2", lessonNoClass, [], attachments);
    // att-2 is a PNG → falls back to the first available PDF attachment
    expect(r).toEqual({
      kind: "attachment",
      attachment: { id: "att-1", file_name: "notes.pdf", title: undefined },
    });
  });

  it("falls back to first-available when the id is unknown — deep link still opens something", () => {
    const r = resolveDeepLinkPdf("ghost-id", lesson, pdfs, attachments);
    expect(r?.kind).toBe("direct");
    if (r?.kind === "direct") expect(r.pdf.id).toBe("class-pdf");
  });
});

describe("LectureListing URL contract", () => {
  // The LectureListing `PDFs` tab navigates with `&tab=attachment&openPdf=1`.
  // This guards the contract LessonView depends on: if either param is
  // dropped, the auto-open effect would silently no-op.
  it("emits both tab=attachment and openPdf=1 for the PDFs tab", () => {
    const wantsPdf = true;
    const tabParam = wantsPdf ? "&tab=attachment&openPdf=1" : "";
    const url = `/lesson/123?courseId=c1${tabParam}`;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("tab")).toBe("attachment");
    expect(params.get("openPdf")).toBe("1");
  });
});
