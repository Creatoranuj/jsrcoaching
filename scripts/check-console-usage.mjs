#!/usr/bin/env node
/**
 * Console usage guard — enforces a shrinking ceiling on raw `console.*`
 * calls in src/. Preferred wrapper: `import { logError } from '@/lib/log'`
 * which routes through reportError + nativeDebug.
 *
 * Allowlist: files that legitimately host console.* (the wrapper itself,
 * dev-only debug helpers).
 */
import { spawnSync } from "node:child_process";

// Snapshot 2026-07-19: 141 raw console.* across src/.
const BUDGET = 141;

const PATTERN = String.raw`console\.(log|warn|error|info|debug)\s*\(`;
const ALLOWLIST = [
  "src/lib/log.ts",
  "src/lib/nativeDebug.ts",
  "src/lib/reportError.ts",
];

const r = spawnSync(
  "rg",
  ["--no-heading", "-n", PATTERN, "src/", "-g", "!**/*.test.*", "-g", "!src/test/**"],
  { encoding: "utf8" },
);
if (r.status !== 0 && r.status !== 1) {
  console.error("rg failed:", r.stderr);
  process.exit(2);
}
const lines = (r.stdout || "")
  .split("\n")
  .filter(Boolean)
  .filter((ln) => !ALLOWLIST.some((p) => ln.startsWith(p + ":")));
const count = lines.length;

if (count > BUDGET) {
  console.error(`❌ console-usage: ${count} raw console.* calls found, budget is ${BUDGET}.`);
  console.error("   Route new logs through '@/lib/log' (logInfo/logWarn/logError).");
  process.exit(1);
}
console.log(`✅ console-usage: ${count}/${BUDGET} raw console.* calls (within budget).`);
