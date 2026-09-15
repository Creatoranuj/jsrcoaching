import { describe, expect, it } from "vitest";
import { computeFitPageSize } from "@/lib/pdfFit";

describe("computeFitPageSize — device-adaptive full-screen fit", () => {
  it("fits width in portrait (phone)", () => {
    expect(computeFitPageSize({ viewportWidth: 411, viewportHeight: 890, pageRatio: 1.414 })).toBe(411);
  });

  it("fits width in landscape so there are no white side strips", () => {
    expect(computeFitPageSize({ viewportWidth: 890, viewportHeight: 411, pageRatio: 1.414 })).toBe(890);
  });

  it("still caps by height in landscape when whole-page mode is requested", () => {
    expect(
      computeFitPageSize({ viewportWidth: 890, viewportHeight: 411, pageRatio: 1.414, wholePage: true })
    ).toBe(Math.floor(411 / 1.414));
  });

  it("falls back to width-fit when the page ratio is unknown", () => {
    expect(computeFitPageSize({ viewportWidth: 890, viewportHeight: 411 })).toBe(890);
  });

  it("never returns below the minimum readable width", () => {
    expect(
      computeFitPageSize({ viewportWidth: 900, viewportHeight: 120, pageRatio: 1.414, wholePage: true })
    ).toBe(240);
  });

  it("landscape tablet keeps a wide page when height allows", () => {
    expect(computeFitPageSize({ viewportWidth: 1024, viewportHeight: 1366, pageRatio: 1.414 })).toBe(1024);
  });
});
