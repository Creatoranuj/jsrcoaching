import { describe, it, expect } from "vitest";
import {
  ALL_CHIP,
  applyFormatFilter,
  groupByFormat,
  normalizeFormat,
} from "@/lib/formatChips";

describe("formatChips.normalizeFormat", () => {
  it("uppercases and aliases common formats", () => {
    expect(normalizeFormat("pdf")).toBe("PDF");
    expect(normalizeFormat("Markdown")).toBe("MD");
    expect(normalizeFormat("md")).toBe("MD");
    expect(normalizeFormat("docx")).toBe("DOC");
    expect(normalizeFormat("pptx")).toBe("PPT");
    expect(normalizeFormat("xlsx")).toBe("XLS");
    expect(normalizeFormat("jpeg")).toBe("JPG");
  });

  it("folds course download buckets (NOTES, DPP) into PDF", () => {
    expect(normalizeFormat("NOTES")).toBe("PDF");
    expect(normalizeFormat("DPP")).toBe("PDF");
  });

  it("falls back to OTHER for blank values", () => {
    expect(normalizeFormat("")).toBe("OTHER");
    expect(normalizeFormat(null)).toBe("OTHER");
    expect(normalizeFormat(undefined)).toBe("OTHER");
  });
});

describe("formatChips.groupByFormat", () => {
  it("returns counts sorted by count desc, then alphabetically", () => {
    const items = [
      { t: "PDF" }, { t: "PDF" }, { t: "PDF" },
      { t: "doc" }, { t: "doc" },
      { t: "md" },
      { t: "jpeg" },
    ];
    expect(groupByFormat(items, (it) => it.t)).toEqual([
      { type: "PDF", count: 3 },
      { type: "DOC", count: 2 },
      { type: "JPG", count: 1 },
      { type: "MD", count: 1 },
    ]);
  });

  it("breaks ties alphabetically (stable ordering across releases)", () => {
    const items = [{ t: "DOC" }, { t: "PDF" }, { t: "MD" }];
    expect(groupByFormat(items, (it) => it.t).map((c) => c.type)).toEqual(["DOC", "MD", "PDF"]);
  });

  it("handles an empty list", () => {
    expect(groupByFormat([], () => "PDF")).toEqual([]);
  });
});

describe("formatChips.applyFormatFilter", () => {
  const items = [
    { t: "PDF", id: 1 },
    { t: "doc", id: 2 },
    { t: "PDF", id: 3 },
    { t: "md", id: 4 },
  ];

  it("ALL chip returns a copy of the full list", () => {
    const out = applyFormatFilter(items, ALL_CHIP, (it) => it.t);
    expect(out).toHaveLength(4);
    expect(out).not.toBe(items); // copy, not same reference
  });

  it("filters by normalised format", () => {
    expect(applyFormatFilter(items, "PDF", (it) => it.t).map((i) => i.id)).toEqual([1, 3]);
    expect(applyFormatFilter(items, "DOC", (it) => it.t).map((i) => i.id)).toEqual([2]);
    expect(applyFormatFilter(items, "MD", (it) => it.t).map((i) => i.id)).toEqual([4]);
  });

  it("unknown chip => empty result (never throws)", () => {
    expect(applyFormatFilter(items, "ZIP", (it) => it.t)).toEqual([]);
  });
});
