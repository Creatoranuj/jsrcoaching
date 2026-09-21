#!/usr/bin/env node
/**
 * Tap-target guard — fails CI when NEW sub-44px icon buttons appear in
 * src/components or src/pages. Uses a numeric ceiling snapshot (same
 * ratchet convention as check-design-tokens.mjs): incremental cleanup
 * lowers the ceiling naturally.
 *
 * Heuristic: a <button>/<Button> tag whose attributes put BOTH height and
 * width in Tailwind steps 6–9 (24–36px) on the same line is almost
 * certainly an icon-only control below the 44px minimum (iOS HIG) /
 * 48dp (Android). Video player chrome and PDF viewer controls are
 * excluded — useAutoHideControls owns that geometry.
 *
 * To lower the budget: fix violations (bump to h-11 w-11 or add padding),
 * then update BUDGET below.
 * To raise the budget: don't. Ask for review instead.
 */
import { spawnSync } from "node:child_process";

// Snapshot 2026-09-21: 31 single-line icon-button matches (tests excluded). Most are
// icons rendered inside padded parents (safe), but the ceiling prevents
// NEW violations from landing without review. Ratchet down after the
// on-device tap sweep at 360px.
const BUDGET = 31;

const PATTERN = String.raw`<[Bb]utton[^>]*\bh-[6-9]\b[^>]*\bw-[6-9]\b|<[Bb]utton[^>]*\bw-[6-9]\b[^>]*\bh-[6-9]\b`;
const PATHS = ["src/components", "src/pages"];
const EXCLUDES = [
  "--glob", "!**/video/**",
  "--glob", "!**/viewer/**",
  "--glob", "!**/*.test.*",
];

const r = spawnSync("rg", ["--no-heading", "-n", PATTERN, ...EXCLUDES, ...PATHS], { encoding: "utf8" });
if (r.status !== 0 && r.status !== 1) {
  console.error("rg failed:", r.stderr);
  process.exit(2);
}
const lines = (r.stdout || "").split("\n").filter(Boolean);
const count = lines.length;

if (count > BUDGET) {
  console.error(`❌ tap-targets: ${count} sub-44px icon buttons found, budget is ${BUDGET}.`);
  console.error("   Fix new violations (min 44x44px: h-11 w-11 or add padding) or update BUDGET in scripts/check-tap-targets.mjs.");
  process.exit(1);
}
console.log(`✅ tap-targets: ${count}/${BUDGET} sub-44px icon buttons (within budget).`);
