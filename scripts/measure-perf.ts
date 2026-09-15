#!/usr/bin/env node
/**
 * Informational perf measurement — no browser automation required.
 *
 * Walks dist/ and prints raw + gzipped sizes per chunk, plus the
 * entry-payload total. Use as a quick sanity check after `vite build`:
 *
 *   npm run build && node scripts/measure-perf.ts
 *
 * For real LCP/INP numbers, open the app in Chrome DevTools > Performance
 * with mobile throttling, or look at the Sentry breadcrumbs emitted by
 * `src/lib/perf/webVitals.ts`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST = "dist";
const ASSETS = join(DIST, "assets");

let files: string[] = [];
try {
  files = readdirSync(ASSETS);
} catch {
  console.error("dist/assets not found — run `npm run build` first.");
  process.exit(1);
}

const fmt = (n: number) => `${(n / 1024).toFixed(1)}KB`;
const rows = files
  .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
  .map((name) => {
    const p = join(ASSETS, name);
    const raw = statSync(p).size;
    const gz = gzipSync(readFileSync(p)).length;
    return { name, raw, gz };
  })
  .sort((a, b) => b.gz - a.gz);

console.log("\n=== Build sizes (top 20 by gzipped) ===");
console.log("gzip".padStart(10) + "  " + "raw".padStart(10) + "  file");
for (const r of rows.slice(0, 20)) {
  console.log(fmt(r.gz).padStart(10) + "  " + fmt(r.raw).padStart(10) + "  " + r.name);
}

const totalJs = rows.filter((r) => r.name.endsWith(".js")).reduce((s, r) => s + r.gz, 0);
const totalCss = rows.filter((r) => r.name.endsWith(".css")).reduce((s, r) => s + r.gz, 0);
console.log(`\nTotal JS (gz):  ${fmt(totalJs)}`);
console.log(`Total CSS (gz): ${fmt(totalCss)}`);

try {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const entries = [...html.matchAll(/\/assets\/([^"']+\.js)/g)].map((m) => m[1]);
  const entryGz = rows.filter((r) => entries.includes(r.name)).reduce((s, r) => s + r.gz, 0);
  console.log(`Initial entry (gz, from index.html): ${fmt(entryGz)}\n`);
} catch {
  /* noop */
}
