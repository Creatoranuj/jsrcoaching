import { describe, expect, it } from "vitest";
import { fitToMargins } from "@/lib/pdfContentBox";
import { computeFitPageWidth } from "@/lib/pdfFit";

const A4 = { width: 595, height: 842 };

describe("fitToMargins — side-margin trim", () => {
  it("crops a page with wide printed side margins and scales it up", () => {
    const fit = fitToMargins({ x: 80, y: 60, width: 435, height: 700 }, A4, 380);
    expect(fit).not.toBeNull();
    expect(fit!.offsetX).toBeGreaterThan(0);
    expect(fit!.cropWidth).toBeLessThanOrEqual(380);
    expect(fit!.renderWidth).toBeGreaterThan(380);
    // Never magnifies past the cap.
    expect(fit!.renderWidth / A4.width).toBeLessThanOrEqual(1.6);
  });

  it("leaves a full-bleed page untouched", () => {
    expect(fitToMargins({ x: 0, y: 0, width: A4.width, height: A4.height }, A4, 380)).toBeNull();
  });

  it("ignores a trim too small to matter", () => {
    expect(fitToMargins({ x: 3, y: 0, width: A4.width - 6, height: A4.height }, A4, 380)).toBeNull();
  });

  it("keeps the whole page height (vertical content is never cut)", () => {
    const fit = fitToMargins({ x: 90, y: 400, width: 400, height: 100 }, A4, 380);
    expect(fit!.offsetY).toBe(0);
    expect(fit!.cropHeight).toBeGreaterThan(0);
  });

  it("handles junk input", () => {
    expect(fitToMargins(null, A4, 380)).toBeNull();
    expect(fitToMargins({ x: 0, y: 0, width: 1, height: 1 }, A4, 380)).toBeNull();
    expect(fitToMargins({ x: 80, y: 0, width: 400, height: 700 }, A4, 0)).toBeNull();
  });
});

describe("computeFitPageWidth — gutter", () => {
  it("keeps the 16px gutter by default", () => {
    expect(computeFitPageWidth(400)).toBe(384);
  });

  it("renders edge-to-edge when the gutter is 0", () => {
    expect(computeFitPageWidth(400, undefined, 0)).toBe(400);
    expect(computeFitPageWidth(1200, 500, 0)).toBe(500);
  });
});
