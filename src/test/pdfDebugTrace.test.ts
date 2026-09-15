import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveDeepLinkPdf } from "@/lib/resolveDeepLinkPdf";

describe("pdf-debug resolver trace", () => {
  let logs: unknown[][] = [];
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a); });
    window.localStorage.setItem("nb_pdf_debug", "1");
  });
  afterEach(() => {
    window.localStorage.removeItem("nb_pdf_debug");
    vi.restoreAllMocks();
  });

  const lesson = { id: "L1", title: "Lec", class_pdf_url: "https://x/c.pdf?token=AAA" };

  it("traces id-match:lesson_pdfs", () => {
    resolveDeepLinkPdf("p2", lesson, [{ id: "p2", file_name: "p.pdf", file_url: "u" }], []);
    expect(logs.some(l => String(l[0]).includes("pdf-debug") && JSON.stringify(l[1]).includes("id-match:lesson_pdfs"))).toBe(true);
  });
  it("traces first-available:class_pdf_url", () => {
    resolveDeepLinkPdf("1", lesson, [], []);
    expect(logs.some(l => JSON.stringify(l[1]).includes("first-available:class_pdf_url"))).toBe(true);
  });
  it("traces id-miss:fallback-to-first", () => {
    resolveDeepLinkPdf("nope", lesson, [], []);
    expect(logs.some(l => JSON.stringify(l[1]).includes("id-miss:fallback-to-first"))).toBe(true);
  });
  it("traces no-match", () => {
    resolveDeepLinkPdf("1", { id: "L", title: "T" }, [], []);
    expect(logs.some(l => JSON.stringify(l[1]).includes("no-match"))).toBe(true);
  });
  it("silent when flag off", () => {
    window.localStorage.removeItem("nb_pdf_debug");
    resolveDeepLinkPdf("1", lesson, [], []);
    expect(logs.length).toBe(0);
  });
});
