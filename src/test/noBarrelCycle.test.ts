import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Regression guard for "Cannot access 'X' before initialization" on the lesson
// viewer: UnifiedVideoPlayer is re-exported by ./index, so importing from the
// barrel inside it creates a cycle that only breaks in the minified build.
describe("video barrel imports", () => {
  it("UnifiedVideoPlayer does not import from its own barrel", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/video/UnifiedVideoPlayer.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']\.["']/);
    expect(src).not.toMatch(/from\s+["']\.\/index["']/);
  });
});
