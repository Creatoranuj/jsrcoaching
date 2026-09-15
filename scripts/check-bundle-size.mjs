#!/usr/bin/env node
/**
 * Bundle size budget guardrail. Runs after `vite build`.
 *
 * Fails the build (exit 1) if:
 *   - Any single JS chunk in dist/assets/ > MAX_CHUNK_KB gzipped
 *   - Entry chunk(s) referenced from dist/index.html > MAX_ENTRY_KB gzipped
 *
 * Set NB_SKIP_SIZE_CHECK=1 to bypass (useful for emergency releases).
 * Tune budgets via NB_MAX_CHUNK_KB / NB_MAX_ENTRY_KB env vars.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST = "dist";
const ASSETS = join(DIST, "assets");
const MAX_CHUNK_KB = Number(process.env.NB_MAX_CHUNK_KB ?? 250);
const MAX_ENTRY_KB = Number(process.env.NB_MAX_ENTRY_KB ?? 180);

if (process.env.NB_SKIP_SIZE_CHECK === "1") {
  console.log("[bundle-size] skipped via NB_SKIP_SIZE_CHECK=1");
  process.exit(0);
}

let assetFiles = [];
try {
  assetFiles = readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
} catch {
  console.log("[bundle-size] no dist/assets directory — skipping");
  process.exit(0);
}

const gzipSize = (path) => gzipSync(readFileSync(path)).length;

// Entry chunks — any <script src="/assets/*.js"> referenced from index.html
let entryRefs = [];
let entryNames = new Set();
try {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  for (const m of html.matchAll(/<(script|link)\b[^>]*(?:src|href)=["']\/assets\/([^"']+\.js)["'][^>]*>/g)) {
    const [, tag, name] = m;
    const rel = tag === "link" ? m[0].match(/\brel=["']([^"']+)["']/)?.[1] : undefined;
    const kind = tag === "script" ? "script" : `link:${rel ?? "unknown"}`;
    entryRefs.push({ name, kind, html: m[0].replace(/\s+/g, " ") });
    entryNames.add(name);
  }
} catch {
  /* no index — keep entryNames empty */
}

const rows = assetFiles.map((name) => {
  const path = join(ASSETS, name);
  const raw = statSync(path).size;
  const gz = gzipSize(path);
  return { name, raw, gz, isEntry: entryNames.has(name) };
});

rows.sort((a, b) => b.gz - a.gz);

const fmt = (n) => `${(n / 1024).toFixed(1)}KB`;
const auditVendorReact = () => {
  const row = rows.find((r) => r.name.startsWith("vendor-react-") && r.name.endsWith(".js"));
  if (!row) return;
  let source = "";
  try {
    source = readFileSync(join(ASSETS, row.name), "utf8");
  } catch {
    return;
  }
  const markers = [
    "react-dom/server", "renderToString", "renderToStaticMarkup",
    "react-router", "@tanstack", "framer", "motion", "radix", "cmdk",
    "vaul", "sonner", "hook-form", "zod", "markdown", "prism",
    "pdf", "sentry", "lucide", "react-dom", "scheduler",
  ];
  console.error("\n[bundle-size] vendor-react audit:");
  console.error(`  - ${row.name}: ${fmt(row.gz)} gzip, ${fmt(row.raw)} raw`);
  if (row.gz > 80 * 1024 && row.raw > 300 * 1024) {
    console.error("  - likely cause: vendor-react is clean but unminified; check Vite/Rolldown JS minifier config");
  }
  for (const marker of markers) {
    console.error(`  - ${marker}: ${source.includes(marker)}`);
  }
};
console.log("\n[bundle-size] gzipped sizes:");
for (const r of rows.slice(0, 15)) {
  console.log(`  ${r.isEntry ? "★" : " "} ${fmt(r.gz).padStart(8)}  ${r.name}`);
}

const failures = [];
const entryTotalGz = rows
  .filter((r) => r.isEntry)
  .reduce((sum, r) => sum + r.gz, 0);

if (entryTotalGz > MAX_ENTRY_KB * 1024) {
  failures.push(
    `Initial entry payload ${fmt(entryTotalGz)} > budget ${MAX_ENTRY_KB}KB gzipped`,
  );
}

for (const r of rows) {
  if (r.gz > MAX_CHUNK_KB * 1024) {
    failures.push(`Chunk ${r.name} ${fmt(r.gz)} > budget ${MAX_CHUNK_KB}KB gzipped`);
  }
}

console.log(`\n[bundle-size] initial entry total: ${fmt(entryTotalGz)} (budget ${MAX_ENTRY_KB}KB)`);

if (failures.length) {
  const entryRows = rows.filter((r) => r.isEntry).sort((a, b) => b.gz - a.gz);
  console.error("\n[bundle-size] initial entry diagnostics:");
  if (!entryRows.length) {
    console.error("  - No /assets/*.js references found in dist/index.html");
  } else {
    for (const r of entryRows) {
      const reasons = entryRefs
        .filter((ref) => ref.name === r.name)
        .map((ref) => ref.kind)
        .join(", ");
      console.error(`  - ${fmt(r.gz).padStart(8)}  ${r.name}  (${reasons || "referenced"})`);
    }
  }

  auditVendorReact();

  console.error("\n[bundle-size] FAIL:");
  for (const f of failures) console.error("  - " + f);
  console.error("\nSet NB_SKIP_SIZE_CHECK=1 to bypass, or tune NB_MAX_*_KB.");
  process.exit(1);
}

console.log("[bundle-size] OK ✓");
