#!/usr/bin/env node
/**
 * Replit/Vite 8 guard: on some clean Linux builds Rolldown can emit a clean
 * vendor-react chunk that is still not minified. That makes the custom
 * bundle-size gate fail even though chunking is correct. Re-minify only that
 * broken chunk shape before the size check runs.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { transformSync } from "esbuild";
import { minify as terserMinify } from "terser";

const ASSETS = join("dist", "assets");
const gz = (code) => gzipSync(Buffer.from(code)).length;
const fmt = (n) => `${(n / 1024).toFixed(1)}KB`;

if (!existsSync(ASSETS)) process.exit(0);

for (const name of readdirSync(ASSETS)) {
  if (!/^vendor-react-.*\.js$/.test(name)) continue;

  const file = join(ASSETS, name);
  const code = readFileSync(file, "utf8");
  const beforeRaw = Buffer.byteLength(code);
  const beforeGz = gz(code);

  // Healthy minified React vendor is ~44KB gzip / ~140KB raw. Replit's broken
  // output is ~95KB gzip / ~320KB raw. Avoid touching healthy builds.
  if (beforeGz <= 80 * 1024 || beforeRaw <= 250 * 1024) continue;

  // Try esbuild first (fast), then terser (slower but consistently beats esbuild
  // on already-minified React vendor chunks). Keep whichever is smallest, and
  // never regress the shipped bundle.
  const candidates = [{ name: "original", code, gz: beforeGz }];

  try {
    const esbuildOut = transformSync(code, {
      minify: true,
      format: "esm",
      target: "es2020",
      legalComments: "none",
    }).code;
    candidates.push({ name: "esbuild", code: esbuildOut, gz: gz(esbuildOut) });
  } catch (err) {
    console.warn(`[postbuild-minify] esbuild failed on ${name}: ${err.message}`);
  }

  try {
    const terserOut = await terserMinify(code, {
      module: true,
      ecma: 2020,
      compress: { passes: 2, pure_getters: true, unsafe_arrows: true },
      mangle: true,
      format: { comments: false },
    });
    if (terserOut.code) {
      candidates.push({ name: "terser", code: terserOut.code, gz: gz(terserOut.code) });
    }
  } catch (err) {
    console.warn(`[postbuild-minify] terser failed on ${name}: ${err.message}`);
  }

  candidates.sort((a, b) => a.gz - b.gz);
  const best = candidates[0];

  if (best.name === "original") {
    const attempted = candidates
      .slice(1)
      .map((c) => `${c.name}=${fmt(c.gz)}`)
      .join(", ");
    console.log(
      `[postbuild-minify] ${name}: keep original ${fmt(beforeGz)} gzip (tried ${attempted || "nothing"})`,
    );
    continue;
  }

  writeFileSync(file, best.code);
  console.log(
    `[postbuild-minify] ${name}: ${fmt(beforeGz)} -> ${fmt(best.gz)} gzip via ${best.name}`,
  );
}
