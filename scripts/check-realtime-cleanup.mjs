#!/usr/bin/env node
/**
 * Realtime cleanup guard.
 *
 * Every `supabase.channel(...)` subscription must be torn down, otherwise the
 * client reconnects forever and Realtime racks up errors + bandwidth
 * (2026-09-25: 26 Realtime errors / 24 h in the Supabase dashboard).
 *
 * Rule: any src file that calls `supabase.channel(` (or `.channel(` on a
 * supabase client alias) must also call `removeChannel(` or `.unsubscribe()`
 * in the same file. Grep-level check, same spirit as the other code guards.
 *
 * Exit 1 lists offending files.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const EXT = /\.(ts|tsx|js|jsx)$/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (EXT.test(entry)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  if (!/\.channel\s*\(/.test(src)) continue;
  const cleaned = /removeChannel\s*\(/.test(src) || /\.unsubscribe\s*\(/.test(src);
  if (!cleaned) offenders.push(file);
}

if (offenders.length > 0) {
  console.error(
    "Realtime cleanup guard failed — these files subscribe to a channel but never remove it:",
  );
  for (const file of offenders) console.error(`  - ${file}`);
  console.error(
    "\nFix: subscribe inside useEffect and return () => supabase.removeChannel(channel).",
  );
  process.exit(1);
}

console.log("Realtime cleanup guard: OK (every channel subscription is cleaned up)");
