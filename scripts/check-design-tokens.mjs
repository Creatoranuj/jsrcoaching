#!/usr/bin/env node
/**
 * Design token guard — fails CI when NEW hardcoded color utilities appear
 * in src/components or src/pages. Uses a numeric ceiling snapshot rather
 * than a per-file allowlist so incremental cleanup lowers the ceiling
 * naturally.
 *
 * To lower the budget: fix violations, then update BUDGET below.
 * To raise the budget: don't. Ask for review instead.
 */
import { spawnSync } from "node:child_process";

// Snapshot 2026-07-19: 172 raw text-white / bg-black occurrences across
// video overlays (intentionally black backgrounds), admin auth pages
// (purple gradient hero, white-on-dark is semantic), and hero carousels
// that sit over banner imagery. Ratchet down as legacy surfaces migrate.
// Allowlist by convention (not enforced): src/components/video/*,
// src/pages/AdminLogin.tsx, src/pages/AdminRegister.tsx,
// src/components/dashboard/HeroCarousel.tsx.
const BUDGET = 172;

const PATTERN = String.raw`\btext-white\b|\bbg-black\b`;
const PATHS = ["src/components", "src/pages"];

const r = spawnSync("rg", ["--no-heading", "-n", PATTERN, ...PATHS], { encoding: "utf8" });
if (r.status !== 0 && r.status !== 1) {
  console.error("rg failed:", r.stderr);
  process.exit(2);
}
const lines = (r.stdout || "").split("\n").filter(Boolean);
const count = lines.length;

if (count > BUDGET) {
  console.error(`❌ design-tokens: ${count} hardcoded color utilities found, budget is ${BUDGET}.`);
  console.error("   Fix new violations or update BUDGET in scripts/check-design-tokens.mjs.");
  console.error("   Prefer semantic tokens: text-foreground / text-primary-foreground / bg-background.");
  process.exit(1);
}
console.log(`✅ design-tokens: ${count}/${BUDGET} hardcoded color utilities (within budget).`);
