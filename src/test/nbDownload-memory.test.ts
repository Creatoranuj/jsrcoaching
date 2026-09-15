/**
 * P2.A — OOM regression guard for the nb-download path.
 *
 * Root cause (July 16, 2026): `resolveNbDownloadSource` used to call
 * `Filesystem.readFile` for every native download and then materialise the
 * base64 payload into a `Uint8Array` + `Blob`. On 2-4 GB Android devices a
 * 40+ MB PDF peaked at ~5× file size in JS heap during decode and the
 * WebView crashed with:
 *   "Failed to allocate a 180404920 byte allocation with 100663296 free bytes"
 * (surfaced to Sentry as `readNbDownload:fail`).
 *
 * The fix hard-caps inline base64 reads via `NATIVE_INLINE_READ_MAX_BYTES`
 * (40 MB) and falls back to `Capacitor.convertFileSrc` so pdf.js can range-
 * stream pages instead. This test STATICALLY guards the source so a future
 * refactor cannot silently remove either guard.
 *
 * See also: docs/observer/2026-07-16-sentry-triage-oom-nbdownload.md.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const HOOK_SRC = fs.readFileSync(
  path.resolve(__dirname, "../hooks/useLocalPdfSource.ts"),
  "utf8",
);

describe("nb-download OOM regression guards", () => {
  it("declares NATIVE_INLINE_READ_MAX_BYTES at <= 40 MB", () => {
    const m = HOOK_SRC.match(/NATIVE_INLINE_READ_MAX_BYTES\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
    expect(m, "NATIVE_INLINE_READ_MAX_BYTES constant must exist").not.toBeNull();
    const mb = Number(m![1]);
    expect(mb).toBeGreaterThan(0);
    expect(mb).toBeLessThanOrEqual(40);
  });

  it("gates inline base64 reads on the size cap in resolveNbDownloadSource", () => {
    const fnMatch = HOOK_SRC.match(/async function resolveNbDownloadSource[\s\S]*?\n\}/);
    expect(fnMatch, "resolveNbDownloadSource must exist").not.toBeNull();
    const fnSrc = fnMatch![0];
    expect(fnSrc).toMatch(/size\s*>\s*NATIVE_INLINE_READ_MAX_BYTES/);
    expect(fnSrc).toMatch(/convertFileSrc|streamUrl/);
  });

  it("readNativeFileAsBlob refuses inline reads above the size cap", () => {
    const fnMatch = HOOK_SRC.match(/async function readNativeFileAsBlob[\s\S]*?\n\}/);
    expect(fnMatch, "readNativeFileAsBlob must exist").not.toBeNull();
    const fnSrc = fnMatch![0];
    expect(fnSrc).toMatch(/stat\?\.size[\s\S]*NATIVE_INLINE_READ_MAX_BYTES/);
  });

  it("does not fabricate a Uint8Array from a raw stat size (no `new Uint8Array(size)`)", () => {
    // Any `new Uint8Array(<variable-named-like-size>)` allocation would
    // reintroduce the OOM class. Whitelist the only safe form we ship:
    //   `new Uint8Array(ab, ...)` (constructing a view over an existing
    //   ArrayBuffer, not allocating fresh bytes).
    const risky = HOOK_SRC.match(/new\s+Uint8Array\s*\(\s*(?!ab\b)\w*(?:size|bytes|length|total)\w*\s*\)/gi);
    expect(risky ?? []).toEqual([]);
  });
});
