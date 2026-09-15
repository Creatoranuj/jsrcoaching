import { describe, it, expect } from "vitest";
import { fitToContent } from "../lib/pdfContentBox";

const A4 = { width: 595, height: 842 };

describe("fitToContent", () => {
  it("leaves full-bleed pages untouched", () => {
    expect(fitToContent({ x: 20, y: 20, width: 555, height: 800 }, A4, 360)).toBeNull();
  });

  it("crops and zooms sparse top-left content (Google Sheets export)", () => {
    const fit = fitToContent({ x: 30, y: 30, width: 190, height: 300 }, A4, 360);
    expect(fit).not.toBeNull();
    expect(fit!.blank).toBe(false);
    expect(fit!.renderWidth).toBeGreaterThan(360);
    expect(fit!.cropWidth).toBeLessThanOrEqual(360);
    expect(fit!.offsetX).toBeGreaterThan(0);
  });

  it("ignores unknown (unmeasurable) pages", () => {
    expect(fitToContent(null, A4, 360)).toBeNull();
  });

  it("marks measured empty pages blank", () => {
    const fit = fitToContent({ x: 0, y: 0, width: 0, height: 0 }, A4, 360);
    expect(fit!.blank).toBe(true);
  });

  it("caps magnification at 3x", () => {
    const fit = fitToContent({ x: 0, y: 0, width: 10, height: 10 }, A4, 360);
    expect(fit!.renderWidth).toBeLessThanOrEqual(A4.width * 3);
  });

  it("never shrinks below the natural page width", () => {
    const fit = fitToContent({ x: 0, y: 0, width: 500, height: 100 }, A4, 360);
    expect(fit!.renderWidth).toBeGreaterThanOrEqual(A4.width);
  });
});
