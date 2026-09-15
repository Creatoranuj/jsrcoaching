import { describe, it, expect } from "vitest";
import { isUpdateRequired } from "@/utils/version";

describe("isUpdateRequired", () => {
  it("returns true when current is older (numeric, not lexical)", () => {
    expect(isUpdateRequired("1.9.0", "1.10.0")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isUpdateRequired("1.10.0", "1.10.0")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isUpdateRequired("2.0.0", "1.99.9")).toBe(false);
  });

  it("treats missing segments as zero", () => {
    expect(isUpdateRequired("1.0", "1.0.0")).toBe(false);
  });

  it("fails open on empty current (must NOT lock the user out)", () => {
    // Deliberate safety behaviour: if the running version can't be parsed we
    // cannot reliably compare, so we never force-block the user. See the
    // FAIL-OPEN note in src/utils/version.ts.
    expect(isUpdateRequired("", "1.0.0")).toBe(false);
  });

  it("treats empty min as 0.0.0 (no update)", () => {
    expect(isUpdateRequired("1.0.0", "")).toBe(false);
  });
});