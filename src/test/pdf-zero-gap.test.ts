import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("PDF pages render with no gap between them", () => {
  it("FastPdfReader page wrappers carry no bottom margin", () => {
    const src = read("src/components/video/FastPdfReader.tsx");
    const wrappers = src.match(/className="mx-auto[^"]*"/g) ?? [];
    expect(wrappers.length).toBeGreaterThan(0);
    for (const cls of wrappers) expect(cls).not.toMatch(/\bmb-\d/);
    // Underscores inside arbitrary-variant selectors MUST be escaped (\_) —
    // unescaped, Tailwind compiles `.react-pdf__Page` to `.react-pdf Page`
    // and the rule matches nothing (root cause of the clipped-page bug).
    expect(src).toContain("[&_.react-pdf\\_\\_Page]:!mb-0");
    expect(src).not.toMatch(/\[&_\.react-pdf__Page\]/);
  });

  it("FastPdfReader scroll surface has no horizontal padding strips", () => {
    const src = read("src/components/video/FastPdfReader.tsx");
    expect(src).not.toMatch(/overscroll-contain bg-\S+ px-2/);
  });

  it("pdf.js viewer strips page margins and borders", () => {
    const html = read("public/pdfjs/web/viewer.html");
    expect(html).toMatch(/\.pdfViewer \.page \{[\s\S]*margin: 0 auto !important;/);
    expect(html).toMatch(/\.pdfViewer \.page \{[\s\S]*border: 0 !important;/);
  });
});
