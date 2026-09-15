import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { maskMobile } from "@/lib/maskMobile";
import { formatGrade } from "@/lib/formatGrade";
import { checkPasswordStrength } from "@/lib/passwordStrength";
import { validateEmailDomain } from "@/lib/emailBlocklist";
import { safeDecodeFileName } from "@/lib/safeDecodeFileName";
import { normalizeMcqIndex, isAnswerCorrect } from "@/lib/quizAnswer";
import {
  safeGet, safeSet, safeRemove, safeGetJSON, safeSetJSON,
  safeSessionGet, safeSessionSet,
} from "@/lib/storage";
import { detectFileType, isLikelyPdfUrl, isKnownNonPdfWebUrl, fileTypeOptions } from "@/lib/detectFileType";

describe("maskMobile", () => {
  it("keeps the first and last two digits", () => {
    expect(maskMobile("9876543210")).toBe("98xxxxxx10");
    expect(maskMobile("+91 98765 43210")).toBe("98xxxxxx10");
  });
  it("returns empty for missing or too-short input", () => {
    expect(maskMobile(null)).toBe("");
    expect(maskMobile(undefined)).toBe("");
    expect(maskMobile("12345")).toBe("");
  });
});

describe("formatGrade", () => {
  it("prefixes bare numbers only", () => {
    expect(formatGrade(12)).toBe("Class 12");
    expect(formatGrade("Class 12")).toBe("Class 12");
    expect(formatGrade("Grade 9")).toBe("Grade 9");
    expect(formatGrade("All")).toBe("All");
  });
  it("supports a custom prefix and empty input", () => {
    expect(formatGrade("10", "Std")).toBe("Std 10");
    expect(formatGrade(null)).toBeNull();
    expect(formatGrade("   ")).toBeNull();
  });
});

describe("checkPasswordStrength", () => {
  it("rejects short passwords", () => {
    expect(checkPasswordStrength("ab1").errors[0]).toContain("At least 6 characters");
  });
  it("rejects common leaked passwords", () => {
    expect(checkPasswordStrength("Password123").errors.join(" ")).toContain("too common");
  });
  it("rates a varied long password strong", () => {
    const r = checkPasswordStrength("Zebra!42quiet");
    expect(r.strength).toBe("strong");
    expect(r.errors).toEqual([]);
  });
  it("rates a plain lowercase password fair or weak", () => {
    expect(["fair", "weak"]).toContain(checkPasswordStrength("mangoes").strength);
  });
});

describe("validateEmailDomain", () => {
  it("allows real providers", () => {
    expect(validateEmailDomain("student@gmail.com")).toBeNull();
  });
  it("blocks known disposable domains and patterns", () => {
    expect(validateEmailDomain("a@mailinator.com")).toContain("not allowed");
    expect(validateEmailDomain("a@my-yopmail.net")).toContain("not allowed");
  });
  it("rejects malformed addresses", () => {
    expect(validateEmailDomain("nope")).toContain("valid email");
  });
});

describe("safeDecodeFileName", () => {
  it("decodes percent-encoded names", () => {
    expect(safeDecodeFileName("Chapter%201.pdf")).toBe("Chapter 1.pdf");
  });
  it("passes through plain and broken input", () => {
    expect(safeDecodeFileName("Chapter 1.pdf")).toBe("Chapter 1.pdf");
    expect(safeDecodeFileName("100%25%E0%A4.pdf")).toBe("100%25%E0%A4.pdf");
    expect(safeDecodeFileName(null)).toBe("");
  });
});

describe("quiz answers", () => {
  const options = ["Delhi", "Mumbai", "Chennai"];
  it("normalises index, letter and text answers", () => {
    expect(normalizeMcqIndex("1", options)).toBe(1);
    expect(normalizeMcqIndex("B", options)).toBe(1);
    expect(normalizeMcqIndex("c.", options)).toBe(2);
    expect(normalizeMcqIndex(" mumbai ", options)).toBe(1);
    expect(normalizeMcqIndex("Kolkata", options)).toBeNull();
    expect(normalizeMcqIndex(null, options)).toBeNull();
  });
  it("matches MCQ answers across formats", () => {
    expect(isAnswerCorrect("Mumbai", "1", "mcq", options)).toBe(true);
    expect(isAnswerCorrect("0", "B", "mcq", options)).toBe(false);
  });
  it("matches true/false and numerical answers", () => {
    expect(isAnswerCorrect("yes", "true", "true_false", null)).toBe(true);
    expect(isAnswerCorrect("no", "true", "tf", null)).toBe(false);
    expect(isAnswerCorrect("3.140000001", "3.14", "numerical", null)).toBe(true);
    expect(isAnswerCorrect("3.2", "3.14", "numerical", null)).toBe(false);
    expect(isAnswerCorrect("abc", "3.14", "numerical", null)).toBe(false);
    expect(isAnswerCorrect("3.14", "3.14", "numeric", null)).toBe(true);
  });
  it("treats blank or missing answers as wrong", () => {
    expect(isAnswerCorrect("", "1", "mcq", options)).toBe(false);
    expect(isAnswerCorrect("1", null, "mcq", options)).toBe(false);
  });
});

describe("safe storage", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());

  it("reads and writes strings", () => {
    expect(safeSet("k", "v")).toBe(true);
    expect(safeGet("k")).toBe("v");
    expect(safeRemove("k")).toBe(true);
    expect(safeGet("k")).toBeNull();
  });
  it("round-trips JSON and falls back on corruption", () => {
    safeSetJSON("j", { a: 1 });
    expect(safeGetJSON("j", null)).toEqual({ a: 1 });
    localStorage.setItem("bad", "{oops");
    expect(safeGetJSON("bad", "fallback")).toBe("fallback");
    expect(localStorage.getItem("bad")).toBeNull();
    expect(safeGetJSON("missing", 7)).toBe(7);
  });
  it("swallows quota errors", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(safeSet("k", "v")).toBe(false);
  });
  it("supports session storage", () => {
    expect(safeSessionSet("s", "1")).toBe(true);
    expect(safeSessionGet("s")).toBe("1");
    expect(safeSessionGet("none")).toBeNull();
  });
});

describe("detectFileType", () => {
  it("classifies by extension", () => {
    expect(detectFileType("https://x.com/a.pdf")).toBe("PDF");
    expect(detectFileType("https://x.com/a.docx?token=1")).toBe("DOCX");
    expect(detectFileType("https://x.com/a.doc")).toBe("DOC");
    expect(detectFileType("https://x.com/a.csv")).toBe("XLSX");
    expect(detectFileType("https://x.com/a.pptx")).toBe("PPT");
    expect(detectFileType("https://x.com/a.md")).toBe("MD");
    expect(detectFileType("https://x.com/a.png")).toBe("IMAGE");
    expect(detectFileType("https://x.com/a.mp4")).toBe("VIDEO");
  });
  it("falls back to domain hints", () => {
    expect(detectFileType("https://docs.google.com/spreadsheets/d/abc")).toBe("XLSX");
    expect(detectFileType("https://docs.google.com/presentation/d/abc")).toBe("PPT");
    expect(detectFileType("https://docs.google.com/document/d/abc")).toBe("DOCX");
    expect(detectFileType("https://youtu.be/abc")).toBe("VIDEO");
    expect(detectFileType("https://drive.google.com/file/d/abc/view")).toBe("PDF");
    expect(detectFileType("https://example.com/page")).toBe("LINK");
    expect(detectFileType("  ")).toBe("LINK");
  });
  it("offers a label for every type", () => {
    expect(fileTypeOptions).toHaveLength(10);
    expect(fileTypeOptions.every((o) => o.label && o.icon)).toBe(true);
  });
});

describe("pdf url predicates", () => {
  it("accepts real pdf sources", () => {
    expect(isLikelyPdfUrl("https://x.com/a.pdf?sig=1")).toBe(true);
    expect(isLikelyPdfUrl("blob:http://localhost/abc")).toBe(true);
    expect(isLikelyPdfUrl("storage://course-files/a.pdf")).toBe(true);
    expect(isLikelyPdfUrl("data:application/pdf;base64,AA")).toBe(true);
    expect(isLikelyPdfUrl("https://p.co/storage/v1/object/sign/x")).toBe(true);
    expect(isLikelyPdfUrl("https://p.co/pdf-proxy?url=a")).toBe(true);
    expect(isLikelyPdfUrl("https://archive.org/details/item")).toBe(true);
  });
  it("rejects viewer pages and empty input", () => {
    expect(isLikelyPdfUrl("https://drive.google.com/drive/folders/xyz")).toBe(false);
    expect(isLikelyPdfUrl("")).toBe(false);
    expect(isLikelyPdfUrl("   ")).toBe(false);
  });
  it("knows which hosts are web pages", () => {
    expect(isKnownNonPdfWebUrl("https://drive.google.com/drive/my-drive")).toBe(true);
    expect(isKnownNonPdfWebUrl("https://www.dropbox.com/scl/fi/abc")).toBe(true);
    expect(isKnownNonPdfWebUrl("https://drive.google.com/file/d/abc/view")).toBe(false);
    expect(isKnownNonPdfWebUrl("https://docs.google.com/document/d/abc/edit")).toBe(false);
    expect(isKnownNonPdfWebUrl("https://p.co/functions/v1/pdf-proxy?url=docs.google.com")).toBe(false);
    expect(isKnownNonPdfWebUrl("")).toBe(false);
  });
});
