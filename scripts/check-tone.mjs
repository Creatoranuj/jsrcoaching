#!/usr/bin/env node
/**
 * Guard against AI-generated tone regressions in user-facing copy.
 * Fails CI when banned phrases show up in src/**.
 *
 * See mem://human-tone-ui for the tone contract.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "src";
const EXTS = new Set([".ts", ".tsx"]);

// Files exempt from the ceiling (existing pre-Phase-2 debt gets amnesty once).
const CEILING_EXEMPT = new Set([
  "src/lib/toast.ts",       // documentation of the pattern
  "scripts/check-tone.mjs", // this file
]);

// Ceilings — each pattern MAY appear this many times globally. Lower over time.
// Set to 0 for anything we consider permanently banned.
const RULES = [
  { name: "Loading...",         re: /"Loading\.\.\."/g,                    ceiling: 3 },
  { name: "Please wait",        re: /"Please wait/g,                        ceiling: 2 },
  { name: "Something went wrong", re: /"Something went wrong/g,             ceiling: 2 },
  { name: "Oops",               re: /"Oops!/g,                              ceiling: 0 },
  { name: "successfully!",      re: /successfully!"/g,                      ceiling: 0 },
  { name: "Awesome",            re: /"Awesome[!.]/g,                        ceiling: 0 },
  { name: "Amazing",            re: /"Amazing[!.]/g,                        ceiling: 0 },
  { name: "Woohoo",             re: /"Woohoo/g,                             ceiling: 0 },
  // Sparkles as a component/JSX tag (not the import line itself)
  { name: "<Sparkles ",         re: /<Sparkles[\s/>]/g,                     ceiling: 4 },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name))) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const counts = Object.fromEntries(RULES.map((r) => [r.name, { total: 0, sites: [] }]));

for (const f of files) {
  if (CEILING_EXEMPT.has(f)) continue;
  const src = readFileSync(f, "utf8");
  for (const rule of RULES) {
    const matches = src.match(rule.re);
    if (!matches) continue;
    counts[rule.name].total += matches.length;
    counts[rule.name].sites.push(`${f}: ${matches.length}`);
  }
}

let failed = false;
for (const rule of RULES) {
  const c = counts[rule.name];
  const symbol = c.total > rule.ceiling ? "✗" : "✓";
  const line = `${symbol} ${rule.name.padEnd(24)} count=${c.total}  ceiling=${rule.ceiling}`;
  if (c.total > rule.ceiling) {
    failed = true;
    console.error(line);
    for (const s of c.sites.slice(0, 5)) console.error(`    ${s}`);
    if (c.sites.length > 5) console.error(`    …and ${c.sites.length - 5} more`);
  } else {
    console.log(line);
  }
}

if (failed) {
  console.error("\ntone guard failed — see mem://human-tone-ui for the fix pattern.");
  process.exit(1);
}
console.log("\ntone guard passed.");
