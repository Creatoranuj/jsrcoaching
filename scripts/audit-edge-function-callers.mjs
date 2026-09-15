#!/usr/bin/env node
// Audit: for each edge function under supabase/functions/, is there a UI
// caller in src/? Writes docs/observer/edge-function-caller-map.md.
//
// Usage: node scripts/audit-edge-function-callers.mjs
//
// Allow-list = functions that legitimately have no UI (CI cron, webhooks,
// URL-redirects, one-shot seed). Extend as new ones ship.

import { readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const FUNCTIONS_DIR = join(ROOT, "supabase/functions");
const SRC_DIR = join(ROOT, "src");
const OUT = join(ROOT, "docs/observer/edge-function-caller-map.md");

const BACKEND_ONLY_ALLOWLIST = new Set([
  "content-redirect",         // invoked as HTTP redirect URL (string built dynamically)
  "razorpay-webhook",         // Razorpay POSTs directly
  "razorpay-refund-webhook",  // Razorpay POSTs directly
  "security-regression",      // CI cron
  "seed-knowledge",           // one-shot admin seed
  "setup-admin",              // bootstrap only
  "get-video-stream",         // server-side YouTube/Piped fallback resolver (called by other edge fns)
  "notify-ai",                // triggered by Supabase DB webhook, not UI
  "send-phone-otp",           // phone OTP feature temp-disabled (PhoneLogin.tsx); keep for re-enable
  "verify-phone-otp",         // pair of send-phone-otp
  "fetch-youtube-transcript", // called server-side by resolve-doubt edge fn (no direct UI caller)
]);


function listFunctions() {
  return readdirSync(FUNCTIONS_DIR)
    .filter((n) => {
      if (n.startsWith("_") || n.startsWith(".")) return false;
      const p = join(FUNCTIONS_DIR, n);
      try { return statSync(p).isDirectory(); } catch { return false; }
    });
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) {
      if (entry === "test" || entry === "__tests__" || entry === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

function findCallers(fnName, files) {
  const hits = [];
  // Match the exact function name as a string token (quoted or slashed).
  const re = new RegExp(`['"\`/]${fnName.replace(/[-.]/g, "\\$&")}['"\`/]`);
  for (const f of files) {
    const txt = readFileSync(f, "utf8");
    if (re.test(txt)) hits.push(relative(ROOT, f));
  }
  return hits;
}

function main() {
  const fns = listFunctions().sort();
  const srcFiles = walk(SRC_DIR);
  const called = [];
  const backendOnly = [];
  const orphaned = [];

  for (const fn of fns) {
    const hits = findCallers(fn, srcFiles);
    if (hits.length > 0) called.push({ fn, hits });
    else if (BACKEND_ONLY_ALLOWLIST.has(fn)) backendOnly.push(fn);
    else orphaned.push(fn);
  }

  const now = new Date().toISOString().slice(0, 10);
  let md = `# Edge Function Caller Map\n\n_Generated: ${now} — \`scripts/audit-edge-function-callers.mjs\`_\n\n`;
  md += `Total functions: **${fns.length}** — called from UI: **${called.length}**, backend-only (expected): **${backendOnly.length}**, orphaned: **${orphaned.length}**\n\n`;

  md += `## Orphaned — needs UI or removal (${orphaned.length})\n\n`;
  md += orphaned.length ? orphaned.map((n) => `- \`${n}\``).join("\n") + "\n\n" : "_None._\n\n";

  md += `## Called from UI (${called.length})\n\n`;
  md += called.map(({ fn, hits }) => `- \`${fn}\` — ${hits.map((h) => `\`${h}\``).join(", ")}`).join("\n") + "\n\n";

  md += `## Backend-only, expected (${backendOnly.length})\n\n`;
  md += backendOnly.map((n) => `- \`${n}\``).join("\n") + "\n\n";
  md += `_To add an expected backend-only function, extend \`BACKEND_ONLY_ALLOWLIST\` in the script._\n`;

  writeFileSync(OUT, md);
  const rel = relative(ROOT, OUT);
  console.log(`Wrote ${rel}`);
  console.log(`  called=${called.length}  backend-only=${backendOnly.length}  orphaned=${orphaned.length}`);
  if (orphaned.length > 0) {
    console.log(`\nOrphaned:\n  ${orphaned.join("\n  ")}`);
    process.exitCode = 1;
  }
}

main();
