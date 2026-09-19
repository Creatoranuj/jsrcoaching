import { describe, expect, it } from "vitest";
import { isStaleChunkError } from "../lib/chunkError";

describe("isStaleChunkError", () => {
  it("matches the Vite stale-chunk failures that killed the lesson viewer", () => {
    for (const msg of [
      "TypeError: Failed to fetch dynamically imported module: /assets/LessonView-abc.js",
      "ChunkLoadError: Loading chunk 42 failed",
      "error loading dynamically imported module",
      "Importing a module script failed.",
    ]) {
      expect(isStaleChunkError(new Error(msg))).toBe(true);
    }
  });

  it("does not swallow ordinary app bugs into a reload loop", () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});
