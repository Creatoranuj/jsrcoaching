import { describe, it, expect } from "vitest";
import { isDebugPackageId } from "@/components/ForceUpdateGate";

/**
 * The optional "Naya version aa gaya hai" nudge must never show on the
 * `.debug` package: "Update karein" fetches the release APK, whose
 * applicationId differs, so it cannot install over the debug build. It also
 * covered every screen during the Maestro Android flows.
 */
describe("ForceUpdateGate — debug package detection", () => {
  it("recognises the CI/QA debug variant", () => {
    expect(isDebugPackageId("com.jsrcoaching.app.debug")).toBe(true);
    expect(isDebugPackageId(" com.jsrcoaching.app.DEBUG ")).toBe(true);
  });

  it("treats the store package and unknown ids as release builds", () => {
    expect(isDebugPackageId("com.jsrcoaching.app")).toBe(false);
    expect(isDebugPackageId("com.jsrcoaching.app.debugger")).toBe(false);
    expect(isDebugPackageId("")).toBe(false);
    expect(isDebugPackageId(undefined)).toBe(false);
    expect(isDebugPackageId(null)).toBe(false);
  });
});
