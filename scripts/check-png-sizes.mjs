#!/usr/bin/env node
/**
 * Guardrail: fail if any tracked PNG under src/ or public/ exceeds the budget.
 *
 * Rationale: WebP/SVG should be the default. PNG is reserved for PWA icons,
 * OG previews, and 3D transparent renders (see docs/ASSET_BUDGET.md).
 *
 * Budget: NB_MAX_PNG_KB (default 30).
 * Allowlist: paths matching NB_PNG_ALLOWLIST (comma-separated globs) OR the
 * built-in list below are exempt.
 * Bypass: NB_SKIP_PNG_CHECK=1.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

if (process.env.NB_SKIP_PNG_CHECK === "1") {
  console.log("[png-size] skipped via NB_SKIP_PNG_CHECK=1");
  process.exit(0);
}

const MAX_KB = Number(process.env.NB_MAX_PNG_KB ?? 30);
const ROOTS = ["src", "public"];
const ALLOWLIST = [
  /^public\/icons\/icon-\d+x\d+\.png$/,      // PWA
  /^public\/icons\/maskable-\d+(x\d+)?\.png$/, // PWA maskable (Android adaptive)
  /^public\/branding\/logo_og_image\.png$/,   // OG preview
  /^public\/apple-touch-icon.*\.png$/,        // iOS

  /-3d\.png$/,                                // 3D transparent renders
  ...(process.env.NB_PNG_ALLOWLIST || "")
    .split(",").map((s) => s.trim()).filter(Boolean)
    .map((p) => new RegExp(p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"))),
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && p.toLowerCase().endsWith(".png")) out.push(p);
  }
  return out;
}

const offenders = [];
for (const root of ROOTS) {
  for (const abs of walk(root)) {
    const rel = relative(".", abs).replace(/\\/g, "/");
    if (ALLOWLIST.some((re) => re.test(rel))) continue;
    const kb = statSync(abs).size / 1024;
    if (kb > MAX_KB) offenders.push({ rel, kb });
  }
}

if (offenders.length) {
  console.error(`\n[png-size] FAIL — PNGs > ${MAX_KB}KB (convert to WebP/SVG or add to allowlist):`);
  for (const o of offenders.sort((a, b) => b.kb - a.kb)) {
    console.error(`  - ${o.kb.toFixed(1)}KB  ${o.rel}`);
  }
  console.error("\nBypass with NB_SKIP_PNG_CHECK=1 or widen NB_MAX_PNG_KB / NB_PNG_ALLOWLIST.");
  process.exit(1);
}
console.log(`[png-size] OK ✓ (budget ${MAX_KB}KB)`);
