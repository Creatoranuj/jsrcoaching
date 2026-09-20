import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Students read /releases to know which version is supported. An admin had to
 * add that row by hand after every APK, so it drifted. CI now publishes it in
 * the same authorized call that announces the version.
 */
const FN = resolve(__dirname, "../../supabase/functions/set-latest-version/index.ts");

describe("release history auto-publish", () => {
  const fn = readFileSync(FN, "utf8");

  it("writes an app_releases row when a version is published", () => {
    expect(fn).toContain('.from("app_releases")');
    expect(fn).toContain("is_current: true");
    expect(fn).toContain('status: "supported"');
  });

  it("demotes the previous current release before claiming the flag", () => {
    const demote = fn.indexOf("is_current: false");
    const promote = fn.indexOf("is_current: true");
    expect(demote).toBeGreaterThan(-1);
    expect(demote).toBeLessThan(promote);
  });

  it("never fails the version publish if release history errors", () => {
    expect(fn).toContain("app_releases publish failed");
  });
});
